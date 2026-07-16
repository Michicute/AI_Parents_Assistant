import base64
import re
import zipfile
from datetime import date
from io import BytesIO
from typing import Any
from xml.etree import ElementTree

from fastapi import HTTPException, status

from app.models.domain import EnglishSkill
from app.services.ai_provider import get_llm_provider
from app.services.rubric_templates import normalize_rubric_criteria


TextExtractionResult = dict[str, str]
UploadPayload = dict[str, Any]

MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024
MAX_MULTI_UPLOAD_FILES = 25
MAX_MULTI_UPLOAD_BYTES = 40 * 1024 * 1024
MAX_PDF_OCR_PAGES = 10
PDF_TEXT_FALLBACK_MIN_CHARS = 20
PDF_RENDER_DPI = 180
SUPPORTED_ASSESSMENT_IMPORT_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/pdf",
    "text/plain",
    "image/jpeg",
    "image/png",
    "image/webp",
}
SUPPORTED_ANSWER_UPLOAD_TYPES = {
    *SUPPORTED_ASSESSMENT_IMPORT_TYPES,
}


def assessment_draft_from_upload(*, filename: str, content_type: str | None, raw: bytes) -> dict[str, Any]:
    _assert_file_size(raw)
    _assert_content_type(content_type, SUPPORTED_ASSESSMENT_IMPORT_TYPES)
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if _is_image_content_type(content_type) or suffix in {"jpg", "jpeg", "png", "webp"}:
        return _assessment_draft_from_images(
            images=[{"raw": raw, "content_type": content_type or _content_type_from_suffix(suffix)}],
            filename=filename,
        )
    if content_type == "application/pdf" or suffix == "pdf":
        return _assessment_draft_from_pdf_upload(filename=filename, raw=raw)
    try:
        extraction = extract_text_result_from_upload(filename=filename, content_type=content_type, raw=raw)
    except HTTPException as exc:
        raise _friendly_assessment_import_error(exc, filename=filename, content_type=content_type) from exc
    return _assessment_draft_from_extracted_text(extraction, filename=filename)


def assessment_draft_from_uploads(*, uploads: list[UploadPayload]) -> dict[str, Any]:
    uploads = _validate_uploads(uploads)
    if len(uploads) == 1:
        upload = uploads[0]
        return assessment_draft_from_upload(
            filename=str(upload["filename"]),
            content_type=upload.get("content_type"),
            raw=upload["raw"],
        )

    image_entries: list[dict[str, Any]] = []
    text_sections: list[str] = []
    methods: list[str] = []
    warnings: list[str] = []
    for upload in uploads:
        filename = str(upload["filename"])
        content_type = upload.get("content_type")
        raw = upload["raw"]
        _assert_content_type(content_type, SUPPORTED_ASSESSMENT_IMPORT_TYPES)
        suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        if _is_image_content_type(content_type) or suffix in {"jpg", "jpeg", "png", "webp"}:
            image_entries.append({"raw": raw, "content_type": content_type or _content_type_from_suffix(suffix)})
            methods.append("openai_vision")
            continue
        if content_type == "application/pdf" or suffix == "pdf":
            pdf_parts = _assessment_pdf_upload_parts(filename=filename, raw=raw)
            image_entries.extend(pdf_parts["images"])
            if pdf_parts["text"].strip():
                text_sections.append(_named_text_section(filename, pdf_parts["text"]))
            if pdf_parts["method"]:
                methods.append(str(pdf_parts["method"]))
            continue
        extraction = extract_text_result_from_upload(filename=filename, content_type=content_type, raw=raw)
        if extraction["text"].strip():
            text_sections.append(_named_text_section(filename, extraction["text"]))
        methods.append(extraction["method"])

    if image_entries:
        draft = get_llm_provider().generate_assessment_draft_from_images(image_entries, filename=_combined_filename(uploads))
        normalized = normalize_assessment_draft(draft, fallback_title=_title_from_filename(_combined_filename(uploads)))
        if text_sections:
            warnings.append("Some text-based files were uploaded with image/scanned files; image/PDF Vision draft was used first. Review and add any missing text-file questions manually.")
        normalized["warnings"] = [*warnings, *normalized.get("warnings", [])]
        normalized["extraction_method"] = "openai_vision"
        return normalized

    combined_text = "\n\n".join(text_sections)
    if not combined_text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not extract text from these assessment files")
    normalized = _assessment_draft_from_extracted_text(
        {"text": combined_text, "method": _combined_method(methods)},
        filename=_combined_filename(uploads),
    )
    return normalized


def _assessment_draft_from_extracted_text(extraction: TextExtractionResult, *, filename: str) -> dict[str, Any]:
    extracted_text = extraction["text"]
    if not extracted_text.strip():
        if extraction["method"] == "openai_vision":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Image and scanned PDF import requires AI OCR. "
                    "Check OPENAI_API_KEY/network access or upload a text-based DOCX, PDF, or TXT file."
                ),
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not extract text from this assessment file")

    warnings: list[str] = []
    try:
        draft = get_llm_provider().generate_assessment_draft_from_document(extracted_text, filename=filename)
    except HTTPException as exc:
        if exc.status_code != status.HTTP_503_SERVICE_UNAVAILABLE:
            raise
        draft = _heuristic_assessment_draft(extracted_text, filename=filename)
        warnings.append("AI draft generation is unavailable, so the system created a basic draft from extracted text. Please review all questions before saving.")
    normalized = normalize_assessment_draft(draft, fallback_title=_title_from_filename(filename))
    normalized["warnings"] = [*warnings, *normalized.get("warnings", [])]
    normalized["extraction_method"] = extraction["method"]
    return normalized


def _assessment_draft_from_images(*, images: list[dict[str, Any]], filename: str) -> dict[str, Any]:
    usable_images = [image for image in images if image.get("raw")]
    if not usable_images:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read image content from this assessment file")
    draft = get_llm_provider().generate_assessment_draft_from_images(usable_images, filename=filename)
    normalized = normalize_assessment_draft(draft, fallback_title=_title_from_filename(filename))
    normalized["extraction_method"] = "openai_vision"
    return normalized


def _assessment_draft_from_pdf_upload(*, filename: str, raw: bytes) -> dict[str, Any]:
    parts = _assessment_pdf_upload_parts(filename=filename, raw=raw)
    if parts["text"].strip() and not parts["images"]:
        return _assessment_draft_from_extracted_text({"text": parts["text"], "method": "pdf_text"}, filename=filename)
    return _assessment_draft_from_images(images=parts["images"], filename=filename)


def _assessment_pdf_upload_parts(*, filename: str, raw: bytes) -> dict[str, Any]:
    try:
        import fitz
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PDF import requires PyMuPDF to render scanned pages before OpenAI Vision analysis.",
        ) from exc

    try:
        with fitz.open(stream=raw, filetype="pdf") as document:
            page_texts = [page.get_text("text") for page in document]
            extracted_text = _clean_text("\n\n".join(page_texts))
            if len(extracted_text) >= PDF_TEXT_FALLBACK_MIN_CHARS:
                return {"text": extracted_text, "images": [], "method": "pdf_text"}
            return {"text": "", "images": _render_pdf_pages(document), "method": "openai_vision"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read this PDF file") from exc


def answer_draft_from_upload(*, filename: str, content_type: str | None, raw: bytes, questions: list[dict]) -> dict[str, Any]:
    _assert_file_size(raw)
    _assert_content_type(content_type, SUPPORTED_ANSWER_UPLOAD_TYPES)
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if _is_image_content_type(content_type) or suffix in {"jpg", "jpeg", "png", "webp"}:
        return _answer_draft_from_images(
            images=[{"raw": raw, "content_type": content_type or _content_type_from_suffix(suffix)}],
            questions=questions,
        )
    if content_type == "application/pdf" or suffix == "pdf":
        return _answer_draft_from_pdf_upload(raw=raw, questions=questions)

    extraction = extract_text_result_from_upload(filename=filename, content_type=content_type, raw=raw)
    extracted_text = extraction["text"]
    warnings: list[str] = []

    answers = draft_answers_from_text(extracted_text, questions)
    if not extracted_text.strip():
        warnings.append("OCR could not extract text from this file. Please review and type answers manually.")
    return {"extracted_text": extracted_text, "answers": answers, "warnings": warnings, "extraction_method": extraction["method"]}


def answer_draft_from_uploads(*, uploads: list[UploadPayload], questions: list[dict]) -> dict[str, Any]:
    uploads = _validate_uploads(uploads)
    if len(uploads) == 1:
        upload = uploads[0]
        return answer_draft_from_upload(
            filename=str(upload["filename"]),
            content_type=upload.get("content_type"),
            raw=upload["raw"],
            questions=questions,
        )

    image_entries: list[dict[str, Any]] = []
    text_sections: list[str] = []
    methods: list[str] = []
    for upload in uploads:
        filename = str(upload["filename"])
        content_type = upload.get("content_type")
        raw = upload["raw"]
        _assert_content_type(content_type, SUPPORTED_ANSWER_UPLOAD_TYPES)
        suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        if _is_image_content_type(content_type) or suffix in {"jpg", "jpeg", "png", "webp"}:
            image_entries.append({"raw": raw, "content_type": content_type or _content_type_from_suffix(suffix)})
            methods.append("openai_vision")
            continue
        if content_type == "application/pdf" or suffix == "pdf":
            image_entries.extend(_render_answer_pdf_upload(raw))
            methods.append("openai_vision")
            continue
        extraction = extract_text_result_from_upload(filename=filename, content_type=content_type, raw=raw)
        if extraction["text"].strip():
            text_sections.append(_named_text_section(filename, extraction["text"]))
        methods.append(extraction["method"])

    if image_entries:
        draft = _answer_draft_from_images(images=image_entries, questions=questions)
        if text_sections:
            draft["warnings"] = [
                *draft["warnings"],
                "Some text-based answer files were uploaded with image/PDF files; Vision answer extraction was used first. Review any missing answers manually.",
            ]
        draft["extraction_method"] = "openai_vision"
        return draft

    extracted_text = "\n\n".join(text_sections)
    answers = draft_answers_from_text(extracted_text, questions)
    warnings: list[str] = []
    if not extracted_text.strip():
        warnings.append("OCR could not extract text from these files. Please review and type answers manually.")
    return {"extracted_text": extracted_text, "answers": answers, "warnings": warnings, "extraction_method": _combined_method(methods)}


def _answer_draft_from_images(*, images: list[dict[str, Any]], questions: list[dict]) -> dict[str, Any]:
    usable_images = [image for image in images if image.get("raw")]
    if not usable_images:
        return {
            "extracted_text": "",
            "answers": [{"question_id": question["id"], "answer_text": ""} for question in questions],
            "warnings": ["OCR could not extract text from this file. Please review and type answers manually."],
            "extraction_method": "openai_vision",
        }
    provider_result = get_llm_provider().extract_student_answers_from_images(usable_images, questions=questions)
    warnings = [str(item) for item in provider_result.get("warnings", [])]
    return {
        "extracted_text": str(provider_result.get("extracted_text") or ""),
        "answers": _answers_from_provider(provider_result.get("answers"), questions),
        "warnings": warnings,
        "extraction_method": "openai_vision",
    }


def _answer_draft_from_pdf_upload(*, raw: bytes, questions: list[dict]) -> dict[str, Any]:
    return _answer_draft_from_images(images=_render_answer_pdf_upload(raw), questions=questions)


def _render_answer_pdf_upload(raw: bytes) -> list[dict[str, Any]]:
    try:
        import fitz
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PDF answer import requires PyMuPDF to render pages before OpenAI Vision analysis.",
        ) from exc

    try:
        with fitz.open(stream=raw, filetype="pdf") as document:
            return _render_pdf_pages(document)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read this PDF file") from exc


def extract_text_from_upload(*, filename: str, content_type: str | None, raw: bytes) -> str:
    return extract_text_result_from_upload(filename=filename, content_type=content_type, raw=raw)["text"]


def extract_text_result_from_upload(*, filename: str, content_type: str | None, raw: bytes) -> TextExtractionResult:
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or suffix == "docx":
        return {"text": _extract_docx_text(raw), "method": "docx_text"}
    if content_type == "application/pdf" or suffix == "pdf":
        return _extract_pdf_text(raw)
    if content_type == "text/plain" or suffix == "txt":
        return {"text": _clean_text(raw.decode("utf-8", errors="ignore")), "method": "plain_text"}
    if _is_image_content_type(content_type):
        return {"text": _extract_images_text_with_openai([{"raw": raw, "content_type": content_type or _content_type_from_suffix(suffix)}]), "method": "openai_vision"}
    return {"text": _clean_text(raw.decode("utf-8", errors="ignore")), "method": "binary_text"}


def normalize_assessment_draft(payload: dict[str, Any], *, fallback_title: str) -> dict[str, Any]:
    questions: list[dict[str, Any]] = []
    for index, raw_question in enumerate(payload.get("questions") or [], start=1):
        if not isinstance(raw_question, dict):
            continue
        question_text = str(raw_question.get("question_text") or "").strip()
        if not question_text:
            continue
        question_type = raw_question.get("question_type") if raw_question.get("question_type") in {"multiple_choice", "essay"} else "essay"
        choices = [str(choice).strip() for choice in raw_question.get("choices") or [] if str(choice).strip()]
        if question_type == "multiple_choice" and not choices:
            question_type = "essay"
        skill = _normalize_skill(raw_question.get("skill_tag"))
        max_score = _coerce_score(raw_question.get("max_score"), default=10.0)
        rubric = normalize_rubric_criteria(skill, raw_question.get("rubric_criteria"))
        questions.append(
            {
                "question_text": question_text,
                "question_type": question_type,
                "choices": choices,
                "expected_answer": _optional_str(raw_question.get("expected_answer")),
                "skill_tag": skill,
                "max_score": max_score,
                "position": index,
                "rubric_criteria": rubric,
                "score_range": str(raw_question.get("score_range") or f"[0,{max_score:g}]"),
            }
        )
    if not questions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No assessment questions were detected in this file")
    return {
        "title": str(payload.get("title") or fallback_title).strip()[:200],
        "description": _optional_str(payload.get("description")),
        "assessment_date": _parse_date(payload.get("assessment_date")),
        "questions": questions,
        "warnings": payload.get("warnings") or [],
    }


def draft_answers_from_text(extracted_text: str, questions: list[dict]) -> list[dict]:
    if not extracted_text.strip():
        return [{"question_id": question["id"], "answer_text": ""} for question in questions]
    chunks = re.split(r"(?:^|\n)\s*(?:Câu|Question)\s*(\d+)\s*[:.)-]\s*", extracted_text, flags=re.IGNORECASE)
    mapped: dict[int, str] = {}
    if len(chunks) > 1:
        for index in range(1, len(chunks), 2):
            try:
                number = int(chunks[index])
            except ValueError:
                continue
            mapped[number] = chunks[index + 1].strip() if index + 1 < len(chunks) else ""
    lines = [line.strip() for line in extracted_text.splitlines() if line.strip()]
    return [
        {
            "question_id": question["id"],
            "answer_text": mapped.get(position + 1, lines[position] if position < len(lines) else ""),
        }
        for position, question in enumerate(questions)
    ]


def image_data_url(raw: bytes, content_type: str) -> str:
    return f"data:{content_type};base64,{base64.b64encode(raw).decode('ascii')}"


def _extract_docx_text(raw: bytes) -> str:
    with zipfile.ZipFile(BytesIO(raw)) as archive:
        xml = archive.read("word/document.xml")
    root = ElementTree.fromstring(xml)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs = []
    for paragraph in root.findall(".//w:p", namespace):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", namespace)).strip()
        if text:
            paragraphs.append(text)
    return _clean_text("\n".join(paragraphs))


def _extract_pdf_text(raw: bytes) -> TextExtractionResult:
    try:
        import fitz
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PDF import requires PyMuPDF. Please install backend OCR dependencies.",
        ) from exc

    try:
        with fitz.open(stream=raw, filetype="pdf") as document:
            page_texts = [page.get_text("text") for page in document]
            extracted_text = _clean_text("\n\n".join(page_texts))
            if len(extracted_text) >= PDF_TEXT_FALLBACK_MIN_CHARS:
                return {"text": extracted_text, "method": "pdf_text"}
            return {"text": _extract_pdf_scan_text(document), "method": "openai_vision"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read this PDF file") from exc


def _extract_pdf_scan_text(document: Any) -> str:
    return _extract_images_text_with_openai(_render_pdf_pages(document))


def _render_pdf_pages(document: Any) -> list[dict[str, Any]]:
    if document.page_count <= 0:
        return []
    page_count = min(document.page_count, MAX_PDF_OCR_PAGES)
    rendered_images = []
    for page_index in range(page_count):
        page = document.load_page(page_index)
        pixmap = page.get_pixmap(dpi=PDF_RENDER_DPI, alpha=False)
        rendered_images.append({"raw": pixmap.tobytes("png"), "content_type": "image/png"})
    return rendered_images


def _extract_images_text_with_openai(images: list[dict[str, Any]]) -> str:
    usable_images = [image for image in images if image.get("raw")]
    if not usable_images:
        return ""
    result = get_llm_provider().extract_text_from_images(usable_images)
    return _clean_text(str(result.get("extracted_text") or ""))


def _validate_uploads(uploads: list[UploadPayload]) -> list[UploadPayload]:
    usable_uploads = [
        {
            "filename": str(upload.get("filename") or "upload"),
            "content_type": upload.get("content_type"),
            "raw": upload.get("raw"),
        }
        for upload in uploads
        if upload.get("raw")
    ]
    if not usable_uploads:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")
    if len(usable_uploads) > MAX_MULTI_UPLOAD_FILES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Upload at most {MAX_MULTI_UPLOAD_FILES} files at a time")
    total_size = 0
    for upload in usable_uploads:
        raw = upload["raw"]
        if not isinstance(raw, bytes):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")
        _assert_file_size(raw)
        total_size += len(raw)
    if total_size > MAX_MULTI_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded files are too large")
    return usable_uploads


def _named_text_section(filename: str, text: str) -> str:
    return f"### Source file: {filename}\n{text.strip()}"


def _combined_filename(uploads: list[UploadPayload]) -> str:
    if len(uploads) == 1:
        return str(uploads[0].get("filename") or "upload")
    return f"{len(uploads)} uploaded files"


def _combined_method(methods: list[str]) -> str:
    unique_methods = [method for index, method in enumerate(methods) if method and method not in methods[:index]]
    if not unique_methods:
        return "unknown"
    return unique_methods[0] if len(unique_methods) == 1 else "multi_file"


def _friendly_assessment_import_error(exc: HTTPException, *, filename: str, content_type: str | None) -> HTTPException:
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    is_image_or_scan = _is_image_content_type(content_type) or suffix in {"jpg", "jpeg", "png", "webp", "pdf"}
    if exc.status_code == status.HTTP_503_SERVICE_UNAVAILABLE and is_image_or_scan:
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Image and scanned PDF import requires AI OCR. "
                "Check OPENAI_API_KEY/network access or upload a text-based DOCX, PDF, or TXT file."
            ),
        )
    return exc


def _content_type_from_suffix(suffix: str) -> str:
    if suffix in {"jpg", "jpeg"}:
        return "image/jpeg"
    if suffix == "webp":
        return "image/webp"
    return "image/png"


def _heuristic_assessment_draft(text: str, *, filename: str) -> dict[str, Any]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    title = lines[0][:200] if lines else _title_from_filename(filename)
    chunks = re_split_questions(text)
    questions = []
    if not chunks and lines:
        chunks = lines[1:] or lines
    for chunk in chunks:
        choices = _extract_choices(chunk)
        questions.append(
            {
                "question_text": _strip_choices(chunk).strip()[:4000],
                "question_type": "multiple_choice" if choices else "essay",
                "choices": choices,
                "expected_answer": None,
                "skill_tag": "grammar" if choices else "writing",
                "max_score": 10,
                "rubric_criteria": {},
                "score_range": "[0,10]",
            }
        )
    return {"title": title, "description": None, "assessment_date": None, "questions": questions, "warnings": []}


def re_split_questions(text: str) -> list[str]:
    parts = re.split(r"(?:^|\n)\s*(?:Câu|Question)\s*\d+\s*[:.)-]\s*", text, flags=re.IGNORECASE)
    return [part.strip() for part in parts[1:] if part.strip()]


def _extract_choices(text: str) -> list[str]:
    matches = re.findall(r"(?:^|\n)\s*([A-D])\s*[\).:-]\s*([^\n]+)", text)
    return [f"{label}. {value.strip()}" for label, value in matches]


def _strip_choices(text: str) -> str:
    return re.sub(r"(?:^|\n)\s*[A-D]\s*[\).:-]\s*[^\n]+", "", text).strip() or text


def _answers_from_provider(raw_answers: Any, questions: list[dict]) -> list[dict]:
    by_id = {}
    if isinstance(raw_answers, list):
        for answer in raw_answers:
            if isinstance(answer, dict) and isinstance(answer.get("question_id"), str):
                by_id[answer["question_id"]] = str(answer.get("answer_text") or "")
    return [
        {
            "question_id": question["id"],
            "answer_text": _normalize_provider_answer_text(question, by_id.get(question["id"], "")),
        }
        for question in questions
    ]


def _normalize_provider_answer_text(question: dict, answer_text: str) -> str:
    if question.get("question_type") != "multiple_choice":
        return answer_text
    selected_choice = _selected_choice_from_marked_options(answer_text)
    matching_choice = _choice_from_answer_text(question, selected_choice or answer_text)
    return matching_choice or selected_choice or answer_text


def _selected_choice_from_marked_options(answer_text: str) -> str | None:
    for line in answer_text.splitlines():
        text = line.strip()
        if not text:
            continue
        if not re.match(r"^(?:[☑☒✓✔✅■●]\s*|(?:\[[xX✓✔]\]|\([xX✓✔]\))\s*)[A-Za-z]\s*[\).:-]", text):
            continue
        cleaned = re.sub(r"^(?:[☑☒✓✔✅■●]\s*|(?:\[[xX✓✔]\]|\([xX✓✔]\))\s*)", "", text).strip()
        return re.sub(r"\s+", " ", cleaned)
    return None


def _choice_from_answer_text(question: dict, answer_text: str) -> str | None:
    answer_normalized = _choice_value_for_matching(answer_text)
    if not answer_normalized:
        return None
    choices = question.get("choices")
    if not isinstance(choices, list):
        return None
    for choice in choices:
        choice_text = str(choice)
        if answer_normalized in {
            _choice_value_for_matching(choice_text),
            _choice_value_for_matching(_choice_without_label(choice_text)),
        }:
            return re.sub(r"\s+", " ", choice_text.strip())
    return None


def _choice_value_for_matching(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _choice_without_label(value: str | None) -> str:
    return re.sub(r"^[A-Za-z]\s*[\).:-]\s*", "", (value or "").strip()).strip()


def _clean_text(value: str) -> str:
    value = value.replace("\x00", " ")
    value = re.sub(r"[ \t]+", " ", value)
    return re.sub(r"\n{3,}", "\n\n", value).strip()


def _assert_file_size(raw: bytes) -> None:
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")
    if len(raw) > MAX_IMPORT_FILE_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is too large")


def _assert_content_type(content_type: str | None, allowed: set[str]) -> None:
    if content_type == "application/octet-stream":
        return
    if content_type and content_type not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type")


def _is_image_content_type(content_type: str | None) -> bool:
    return content_type in {"image/jpeg", "image/png", "image/webp"}


def _normalize_skill(value: Any) -> str:
    try:
        return EnglishSkill(str(value)).value
    except Exception:
        return EnglishSkill.grammar.value


def _coerce_score(value: Any, *, default: float) -> float:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return default
    return min(max(score, 0.5), 100.0)


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _title_from_filename(filename: str) -> str:
    stem = filename.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    return stem.replace("_", " ").replace("-", " ").strip().title() or "Imported Assessment"
