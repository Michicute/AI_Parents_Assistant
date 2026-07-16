import json
import re
from abc import ABC, abstractmethod
from typing import Any

from fastapi import HTTPException, status
from openai import OpenAI, OpenAIError

from app.core.config import get_settings


class BaseLLMProvider(ABC):
    @abstractmethod
    def generate_parent_answer(
        self,
        message: str,
        context: list[str],
        locale: str | None = None,
        channel: str | None = None,
        intents: list[str] | None = None,
        conversation_history: list[str] | None = None,
    ) -> str:
        raise NotImplementedError

    def generate_assessment_progress_insight(self, payload: dict[str, Any]) -> dict[str, Any]:
        parent_language = payload.get("parent_language") or "vi"
        if str(parent_language).casefold().startswith("en"):
            summary = "The new graded assessment is ready for review. The student should build on stronger skills and practise weaker areas with guidance."
            parent_actions = ["Ask your child to explain their thinking in their own words.", "Keep short weekly practice focused on the weaker skill."]
        else:
            summary = "Đã cập nhật kết quả bài kiểm tra và cần giáo viên/phụ huynh xem lại xu hướng kỹ năng."
            parent_actions = ["Khuyến khích con luyện ngắn theo kỹ năng còn yếu, không đưa sẵn đáp án."]
        return {
            "summary": summary,
            "new_strengths": payload.get("new_strengths", []),
            "new_weaknesses": payload.get("new_weaknesses", []),
            "improved_weaknesses": [],
            "persistent_weaknesses": payload.get("persistent_weaknesses", []),
            "teacher_actions": ["Xem lại các câu có điểm thấp và ghi nhận xét cụ thể cho học viên."],
            "parent_actions": parent_actions,
            "confidence": 0.75,
        }

    def generate_assessment_draft_from_document(self, text: str, *, filename: str) -> dict[str, Any]:
        return _heuristic_assessment_draft(text, filename=filename)

    def generate_assessment_draft_from_images(self, images: list[dict[str, Any]], *, filename: str) -> dict[str, Any]:
        return {
            "title": filename.rsplit(".", 1)[0].replace("_", " ").title(),
            "description": None,
            "assessment_date": None,
            "questions": [
                {
                    "question_text": "Review the uploaded image and enter the assessment question manually.",
                    "question_type": "essay",
                    "choices": [],
                    "expected_answer": None,
                    "skill_tag": "writing",
                    "max_score": 10,
                    "rubric_criteria": {},
                    "score_range": "[0,10]",
                }
            ],
            "warnings": ["Image assessment draft generation requires AI_PROVIDER=openai."],
        }

    def extract_text_from_images(self, images: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "extracted_text": "",
            "warnings": ["Image/PDF-scan OCR requires AI_PROVIDER=openai. Please review and type content manually."],
        }

    def extract_student_answers_from_image(self, raw: bytes, *, content_type: str, questions: list[dict]) -> dict[str, Any]:
        return self.extract_student_answers_from_images(
            [{"raw": raw, "content_type": content_type}],
            questions=questions,
        )

    def extract_student_answers_from_images(self, images: list[dict[str, Any]], *, questions: list[dict]) -> dict[str, Any]:
        return {
            "extracted_text": "",
            "answers": [{"question_id": question["id"], "answer_text": ""} for question in questions],
            "warnings": ["Image OCR requires AI_PROVIDER=openai. Please review and type answers manually."],
        }


class MockLLMProvider(BaseLLMProvider):
    def generate_parent_answer(
        self,
        message: str,
        context: list[str],
        locale: str | None = None,
        channel: str | None = None,
        intents: list[str] | None = None,
        conversation_history: list[str] | None = None,
    ) -> str:
        joined = " ".join(context) if context else "Không tìm thấy ngữ cảnh được phép truy cập."
        if channel == "zalo":
            return (
                "📌 **Tóm tắt:** Dựa trên thông tin phụ huynh được phép xem, "
                f"{joined}\n\n"
                "- Hỏi con một câu gợi mở về nội dung vừa học.\n"
                "- Duy trì luyện tiếng Anh ngắn mỗi ngày.\n"
                "- Trao đổi với giáo viên nếu vấn đề kéo dài."
            )
        return (
            "Dựa trên thông tin phụ huynh được phép xem, "
            f"{joined} Bước hỗ trợ phù hợp là hỏi con một câu gợi mở, "
            "duy trì luyện tiếng Anh ngắn mỗi ngày và trao đổi với giáo viên nếu vấn đề kéo dài."
        )

    def generate_assessment_progress_insight(self, payload: dict[str, Any]) -> dict[str, Any]:
        latest = payload.get("latest_assessment", {})
        skill_summary = latest.get("skill_summary", {})
        strengths = [f"{skill}: {data.get('percent')}%" for skill, data in skill_summary.items() if (data.get("percent") or 0) >= 80]
        weaknesses = [f"{skill}: {data.get('percent')}%" for skill, data in skill_summary.items() if (data.get("percent") or 0) < 70]
        trend = _assessment_trend_changes(payload)
        parent_language = str(payload.get("parent_language") or "vi").casefold()
        if parent_language.startswith("en"):
            summary = "The new assessment has been graded. Your child should keep building on stronger skills and practise weaker areas with guidance."
            parent_actions = ["Ask your child to explain their thinking in their own words.", "Keep short weekly practice focused on the weaker skill."]
        else:
            summary = "Bài kiểm tra mới đã được chấm. Học viên cần tiếp tục phát huy kỹ năng mạnh và luyện tập có hướng dẫn ở kỹ năng còn yếu."
            parent_actions = ["Cho con giải thích lại cách làm bằng lời của mình.", "Duy trì luyện tập ngắn theo kỹ năng yếu trong tuần."]
        return {
            "summary": summary,
            "new_strengths": strengths,
            "new_weaknesses": weaknesses,
            "improved_weaknesses": trend["improved_weaknesses"],
            "persistent_weaknesses": trend["persistent_weaknesses"] or payload.get("historical_weaknesses", []),
            "teacher_actions": ["Ưu tiên nhận xét vào kỹ năng có tỷ lệ dưới 70%.", "Cho học viên sửa một lỗi nhỏ dựa trên rubric."],
            "parent_actions": parent_actions,
            "confidence": 0.82,
        }

    def generate_assessment_draft_from_document(self, text: str, *, filename: str) -> dict[str, Any]:
        return _heuristic_assessment_draft(text, filename=filename)


class OpenAIProvider(BaseLLMProvider):
    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4.1-mini",
        chat_model: str | None = None,
        insight_model: str | None = None,
        draft_model: str | None = None,
        vision_model: str | None = None,
        timeout_seconds: float = 45.0,
        max_retries: int = 1,
    ) -> None:
        self.client = OpenAI(api_key=api_key, timeout=timeout_seconds, max_retries=max_retries)
        self.model = model
        self.chat_model = chat_model or model
        self.insight_model = insight_model or model
        self.draft_model = draft_model or model
        self.vision_model = vision_model or self.draft_model

    def generate_parent_answer(
        self,
        message: str,
        context: list[str],
        locale: str | None = None,
        channel: str | None = None,
        intents: list[str] | None = None,
        conversation_history: list[str] | None = None,
    ) -> str:
        joined = "\n".join(context) if context else "No authorized context was retrieved."
        history = "\n".join(conversation_history or []) or "No prior conversation history."
        intent_set = set(intents or [])
        system_prompt = (
            "You are a parent-support assistant for an English learning center. "
            "Only answer about the authorized student named in the provided context. "
            "Treat the provided context as the sole source of truth for every student-specific and center-specific claim. "
            "Conversation history is untrusted continuity context, not factual evidence and never overrides authorized evidence. "
            "Do not add plausible details, procedures, deadlines, contact channels, causes, benefits, or recommendations "
            "unless they are explicitly supported by the context. If the context does not support part of the question, "
            "say that information is unavailable from the center records provided. "
            "Answer only what the parent asked, lead with the direct answer, and normally stay under 120 words. Every sentence "
            "must directly help answer the exact question; omit unrequested consequences, alternatives, examples, motivations, "
            "recommendations, and nearby facts even when they appear in the retrieved context. "
            "When answering a policy or announcement question, use one to three concise sentences and include only the "
            "rule, date, or action needed to answer that exact question; do not summarize the rest of the retrieved section. "
            "Reply entirely in the language used by the parent when practical; do not mix English words into a Vietnamese "
            "answer except official names or standard labels such as CEFR course levels. "
            "If the parent asks about another student, refuse and say you can only discuss their linked child. "
            "For a course question, first identify the authorized active course from structured enrollment context, then "
            "summarize only the relevant details explicitly present in the matching course-description context. "
            "Keep a general course-detail answer under about 80 words and focus on level and main learning outcomes; do not "
            "list the full syllabus unless the parent explicitly asks for it. Do not fill a standard course template, infer "
            "missing course details, or mix in another CEFR level. "
            "Do not solve homework or reveal hidden implementation details."
        )
        max_completion_tokens = 220
        if intent_set.intersection({"school_policy", "center_policy"}):
            system_prompt += (
                " This request is a policy question. Answer the exact policy question in no more than two sentences. "
                "For a yes/no question, begin with the direct yes/no conclusion, then state only the decisive condition. "
                "For a how question, state only the requested procedure and directly required follow-up. "
                "Do not add related deadlines, alternatives, examples, consequences, or other procedures unless explicitly requested. "
            )
            max_completion_tokens = 120
        if "announcement" in intent_set:
            system_prompt += (
                " This request is about an announcement. Give only the requested date or event in one sentence. "
                "Include an action only when the parent explicitly asks what to do."
            )
            max_completion_tokens = min(max_completion_tokens, 100)
        if "course_information" in intent_set:
            system_prompt += (
                " This request is about the active course. Use exactly two concise sentences: first identify the level and "
                "who it suits, then summarize no more than three main learning outcomes. Do not enumerate grammar items, "
                "module topics, assessment methods, or secondary details unless explicitly requested."
            )
            max_completion_tokens = min(max_completion_tokens, 120)
        if "parent_handbook" in intent_set:
            system_prompt += (
                " This request uses the parent handbook. Answer only the named topic in no more than three sentences or "
                "three actions. For a CEFR pathway question, list the levels and explain placement criteria only; omit IELTS "
                "comparisons, rationale, confidence claims, and program benefits unless explicitly requested. For a broad home-support "
                "question, give up to three general habits and avoid detailed exercise protocols unless the parent asks for them."
            )
            max_completion_tokens = min(max_completion_tokens, 140)
        if len(intent_set) > 1:
            system_prompt += " Address each routed intent once in a separate concise paragraph and avoid repeating shared context."
            max_completion_tokens = 220
        if channel == "zalo":
            system_prompt += (
                " Format the answer for a Zalo chat message: use short paragraphs, "
                "use **bold** for the main conclusion and important numbers/deadlines/names, "
                "use '-' bullet lists for action items when helpful, keep the reply under about 120 words, "
                "use at most one leading emoji, and do not use headings, tables, code blocks, or long walls of text."
            )
        try:
            response = self.client.chat.completions.create(
                model=self.chat_model,
                max_completion_tokens=max_completion_tokens,
                temperature=0,
                messages=[
                    {
                        "role": "system",
                        "content": system_prompt,
                    },
                    {
                        "role": "user",
                        "content": (
                            f"<authorized_evidence>\n{joined}\n</authorized_evidence>\n\n"
                            f"<conversation_history>\n{history}\n</conversation_history>\n\n"
                            f"<parent_question>\n{message}\n</parent_question>"
                        ),
                    },
                ],
            )
        except OpenAIError as exc:
            _raise_ai_provider_unavailable(exc)
        return _strip_thinking(response.choices[0].message.content or "").strip()

    def generate_assessment_progress_insight(self, payload: dict[str, Any]) -> dict[str, Any]:
        parent_language = payload.get("parent_language") or "vi"
        try:
            response = self.client.chat.completions.create(
                model=self.insight_model,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You create parent-friendly and teacher-useful English learning insights after a graded assessment. "
                            "Use only the provided authorized assessment context. Compare the new assessment against historical data "
                            "only for the same skills. Expected answers are private diagnostic evidence: compare them with the student's "
                            "submitted answer internally to identify the underlying concept or subskill, especially when teacher feedback "
                            "is absent. Never quote, paraphrase, spell out, or contrast the expected answer with the student's answer. "
                            "Do not write corrections such as 'replace X with Y' and do not reveal answer keys, exact correct answers, "
                            "question text, or submit-ready solutions. Report only the skill-level finding, such as needing practice with "
                            "irregular past tense or present continuous. Use skill-summary percentages when a "
                            "score is useful; do not state raw points such as 9/10. If historical_same_skill has no percentage or has "
                            "assessment_count 0, do not claim improvement, decline, persistence, or comparison with previous results. "
                            "Do not invent a weakness merely because a strong score is below 100%; base strengths and weaknesses on "
                            "the supplied skill summary, question wording, rubric criteria, and teacher feedback. Name a specific "
                            "grammar form or subskill only when one of those fields explicitly identifies it; otherwise stay at the "
                            "broader authorized skill level instead of guessing. "
                            f"Write summary, new_strengths, new_weaknesses, improved_weaknesses, persistent_weaknesses, and parent_actions in the parent's preferred language: {parent_language}. "
                            "Write teacher_actions in Vietnamese. "
                            "Return only JSON with keys: summary string, new_strengths string array, new_weaknesses string array, "
                            "improved_weaknesses string array, persistent_weaknesses string array, teacher_actions string array, parent_actions string array, confidence number from 0 to 1."
                        ),
                    },
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
            )
        except OpenAIError as exc:
            _raise_ai_provider_unavailable(exc)
        return parse_llm_json(response.choices[0].message.content or "{}")

    def generate_assessment_draft_from_document(self, text: str, *, filename: str) -> dict[str, Any]:
        payload = {"filename": filename, "document_text": text[:24000]}
        try:
            response = self.client.chat.completions.create(
                model=self.draft_model,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You convert an English Learning Center assessment document into a teacher-review draft. "
                            "Use only the uploaded document text. Do not invent missing questions or answer keys. "
                            "Return JSON with keys: title string, description string or null, assessment_date ISO date or null, "
                            "questions array, warnings array. Each question must have: question_text string, "
                            "question_type 'multiple_choice' or 'essay', choices string array, expected_answer string or null, "
                            "skill_tag one of reading,listening,speaking,writing,grammar,vocabulary, max_score number, "
                            "rubric_criteria object, score_range string. If uncertain about skill_tag, use grammar for grammar-like "
                            "items and reading otherwise. If no answer key is present, expected_answer must be null."
                        ),
                    },
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
            )
        except OpenAIError as exc:
            _raise_ai_provider_unavailable(exc)
        return parse_llm_json(response.choices[0].message.content or "{}")

    def generate_assessment_draft_from_images(self, images: list[dict[str, Any]], *, filename: str) -> dict[str, Any]:
        from app.services.assessment_import import image_data_url

        content: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": (
                    "Convert these uploaded English Learning Center assessment images into a teacher-review draft. "
                    "Use only visible content from the images. Do not invent missing questions. "
                    "Return JSON with keys: title string, description string or null, assessment_date ISO date or null, "
                    "questions array, warnings array. Each question must have: question_text string, "
                    "question_type 'multiple_choice' or 'essay', choices string array, expected_answer string or null, "
                    "skill_tag one of reading,listening,speaking,writing,grammar,vocabulary, max_score number, "
                    "rubric_criteria object, score_range string. If an answer key is visible, include expected_answer; "
                    "otherwise expected_answer must be null. Never solve unanswered questions."
                ),
            }
        ]
        for image in images[:10]:
            raw = image.get("raw")
            content_type = image.get("content_type") or "image/png"
            if isinstance(raw, bytes):
                content.append({"type": "image_url", "image_url": {"url": image_data_url(raw, str(content_type))}})
        try:
            response = self.client.chat.completions.create(
                model=self.vision_model,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You extract assessment questions from teacher-uploaded images for review. "
                            "Only transcribe and structure visible assessment content. Do not create new questions."
                        ),
                    },
                    {"role": "user", "content": content},
                ],
            )
        except OpenAIError as exc:
            _raise_ai_provider_unavailable(exc)
        return parse_llm_json(response.choices[0].message.content or "{}")

    def extract_text_from_images(self, images: list[dict[str, Any]]) -> dict[str, Any]:
        from app.services.assessment_import import image_data_url

        content: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": (
                    "Transcribe all visible text from these English Learning Center assessment images. "
                    "Preserve question numbers, choices, headings, and line breaks as much as possible. "
                    "Do not answer questions, do not create missing content, and do not summarize. "
                    "Return JSON with keys: extracted_text string, warnings string array."
                ),
            }
        ]
        for image in images[:10]:
            raw = image.get("raw")
            content_type = image.get("content_type") or "image/png"
            if isinstance(raw, bytes):
                content.append({"type": "image_url", "image_url": {"url": image_data_url(raw, str(content_type))}})
        try:
            response = self.client.chat.completions.create(
                model=self.vision_model,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an OCR transcription service for teacher-uploaded English assessment materials. "
                            "Only transcribe visible text. Never solve questions or invent missing text."
                        ),
                    },
                    {"role": "user", "content": content},
                ],
            )
        except OpenAIError as exc:
            _raise_ai_provider_unavailable(exc)
        return parse_llm_json(response.choices[0].message.content or "{}")

    def extract_student_answers_from_image(self, raw: bytes, *, content_type: str, questions: list[dict]) -> dict[str, Any]:
        return self.extract_student_answers_from_images(
            [{"raw": raw, "content_type": content_type}],
            questions=questions,
        )

    def extract_student_answers_from_images(self, images: list[dict[str, Any]], *, questions: list[dict]) -> dict[str, Any]:
        from app.services.assessment_import import image_data_url

        question_payload = [
            {
                "question_id": question["id"],
                "position": index + 1,
                "question_text": question["question_text"],
                "question_type": question["question_type"],
                "choices": question["choices"],
            }
            for index, question in enumerate(questions)
        ]
        content: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": (
                    "Extract only the student's submitted answers from these uploaded answer-sheet images. "
                    "For multiple-choice questions, answer_text must be only the visibly marked option label and text, "
                    "such as 'B. goes'. Do not include the question sentence, unmarked options, point value, or instructions. "
                    "If a multiple-choice row has a visible mark next to an option, use that marked option as answer_text. "
                    "For written-response questions, answer_text must be only the student's written response. "
                    "If a question has no visible student answer, return an empty string for that question_id. "
                    "Question metadata:\n"
                    f"{json.dumps({'questions': question_payload}, ensure_ascii=False)}"
                ),
            }
        ]
        for image in images[:10]:
            raw = image.get("raw")
            content_type = str(image.get("content_type") or "image/png")
            if isinstance(raw, bytes):
                content.append({"type": "image_url", "image_url": {"url": image_data_url(raw, content_type)}})

        try:
            response = self.client.chat.completions.create(
                model=self.vision_model,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You extract a student's already-done assessment answers from an uploaded image. "
                            "Use the provided question_id values to map each visible answer to the correct question. "
                            "For multiple-choice questions, the student's answer is the option that is visibly selected, "
                            "such as a checked box, filled circle, circled letter, tick mark, underline, or other clear mark. "
                            "When an option is selected, return only the selected option label and text, for example 'B. goes'. "
                            "Do not return the whole question, all choices, point value, or surrounding instructions as the answer. "
                            "For each multiple-choice answer_text, returning multiple lines or unmarked options is invalid. "
                            "For written-response questions, return only the student's written response. "
                            "If no student selection or written response is visible for a question, return an empty string. "
                            "Never solve questions, infer an answer from the correct answer key, or fill missing answers with guesses. "
                            "Return JSON with keys: extracted_text string, answers array of {question_id, answer_text}, warnings array."
                        ),
                    },
                    {"role": "user", "content": content},
                ],
            )
        except OpenAIError as exc:
            _raise_ai_provider_unavailable(exc)
        return parse_llm_json(response.choices[0].message.content or "{}")


class LocalQwenProvider(OpenAIProvider):
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        chat_model: str | None = None,
        insight_model: str | None = None,
        draft_model: str | None = None,
        timeout_seconds: float = 45.0,
        max_retries: int = 1,
        openai_api_key: str | None = None,
        openai_model: str = "gpt-4.1-mini",
        openai_insight_model: str | None = None,
        openai_draft_model: str | None = None,
        openai_vision_model: str | None = None,
    ) -> None:
        super().__init__(
            api_key=api_key,
            model=model,
            chat_model=chat_model,
            insight_model=insight_model,
            draft_model=draft_model,
            vision_model=openai_vision_model,
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
        )
        self.client = OpenAI(api_key=api_key, base_url=base_url, timeout=timeout_seconds, max_retries=max_retries)
        self.openai_api_key = openai_api_key
        self.openai_model = openai_model
        self.openai_insight_model = openai_insight_model
        self.openai_draft_model = openai_draft_model
        self.openai_vision_model = openai_vision_model
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries

    def _openai_assessment_provider(self) -> OpenAIProvider:
        if not self.openai_api_key or self.openai_api_key.startswith("replace-with-"):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Assessment and test-related AI tasks require OPENAI_API_KEY because AI_PROVIDER=qwen_local only handles lightweight chat tasks locally.",
            )
        return OpenAIProvider(
            self.openai_api_key,
            model=self.openai_model,
            insight_model=self.openai_insight_model,
            draft_model=self.openai_draft_model,
            vision_model=self.openai_vision_model,
            timeout_seconds=self.timeout_seconds,
            max_retries=self.max_retries,
        )

    def generate_assessment_progress_insight(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._openai_assessment_provider().generate_assessment_progress_insight(payload)

    def generate_assessment_draft_from_document(self, text: str, *, filename: str) -> dict[str, Any]:
        return self._openai_assessment_provider().generate_assessment_draft_from_document(text, filename=filename)

    def generate_assessment_draft_from_images(self, images: list[dict[str, Any]], *, filename: str) -> dict[str, Any]:
        return self._openai_assessment_provider().generate_assessment_draft_from_images(images, filename=filename)

    def extract_text_from_images(self, images: list[dict[str, Any]]) -> dict[str, Any]:
        return self._openai_assessment_provider().extract_text_from_images(images)

    def extract_student_answers_from_images(self, images: list[dict[str, Any]], *, questions: list[dict]) -> dict[str, Any]:
        return self._openai_assessment_provider().extract_student_answers_from_images(images, questions=questions)


def _raise_ai_provider_unavailable(exc: OpenAIError) -> None:
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"LLM request failed: {exc}",
    ) from exc


def parse_llm_json(content: str) -> dict[str, Any]:
    text = _strip_thinking(content or "").strip()
    try:
        value = json.loads(text or "{}")
    except json.JSONDecodeError:
        value = json.loads(_extract_first_json_object(text))
    if not isinstance(value, dict):
        raise ValueError("LLM response must be a JSON object")
    return value


def _strip_thinking(content: str) -> str:
    return re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL | re.IGNORECASE)


def _extract_first_json_object(content: str) -> str:
    start = content.find("{")
    if start < 0:
        raise ValueError("No JSON object found in LLM response")
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(content)):
        char = content[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return content[start : index + 1]
    raise ValueError("Unterminated JSON object in LLM response")


def _assessment_trend_changes(payload: dict[str, Any]) -> dict[str, list[str]]:
    trend = payload.get("recent_assessment_trend")
    if not isinstance(trend, list) or len(trend) < 2:
        return {"improved_weaknesses": [], "persistent_weaknesses": []}
    current_assessment_id = payload.get("assessment_id")
    current = next((item for item in trend if isinstance(item, dict) and item.get("assessment_id") == current_assessment_id), None)
    previous = next((item for item in trend if isinstance(item, dict) and item.get("assessment_id") != current_assessment_id), None)
    if current is None or previous is None:
        return {"improved_weaknesses": [], "persistent_weaknesses": []}
    current_skills = current.get("skill_summary") if isinstance(current.get("skill_summary"), dict) else {}
    previous_skills = previous.get("skill_summary") if isinstance(previous.get("skill_summary"), dict) else {}
    improved = []
    persistent = []
    for skill, previous_data in previous_skills.items():
        if not isinstance(previous_data, dict):
            continue
        current_data = current_skills.get(skill)
        if not isinstance(current_data, dict):
            continue
        previous_percent = previous_data.get("percent")
        current_percent = current_data.get("percent")
        if not isinstance(previous_percent, (int, float)) or not isinstance(current_percent, (int, float)):
            continue
        if previous_percent < 70 <= current_percent:
            improved.append(f"{skill}: {previous_percent}% -> {current_percent}%")
        elif previous_percent < 70 and current_percent < 70:
            persistent.append(f"{skill}: {previous_percent}% -> {current_percent}%")
    return {"improved_weaknesses": improved, "persistent_weaknesses": persistent}


def _heuristic_assessment_draft(text: str, *, filename: str) -> dict[str, Any]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    title = lines[0][:200] if lines else filename.rsplit(".", 1)[0].replace("_", " ").title()
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


AIProvider = BaseLLMProvider
DeterministicProvider = MockLLMProvider


def get_llm_provider() -> BaseLLMProvider:
    settings = get_settings()
    provider = settings.ai_provider.casefold()
    if provider == "mock":
        return MockLLMProvider()
    if provider == "openai":
        if not settings.openai_api_key or settings.openai_api_key.startswith("replace-with-"):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OPENAI_API_KEY is required when AI_PROVIDER=openai",
            )
        return OpenAIProvider(
            settings.openai_api_key,
            model=settings.openai_model,
            chat_model=settings.resolved_openai_chat_model,
            insight_model=settings.resolved_openai_insight_model,
            draft_model=settings.resolved_openai_draft_model,
            vision_model=settings.resolved_openai_vision_model,
            timeout_seconds=settings.openai_timeout_seconds,
            max_retries=settings.openai_max_retries,
        )
    if provider == "qwen_local":
        return LocalQwenProvider(
            base_url=settings.local_llm_base_url,
            api_key=settings.local_llm_api_key,
            model=settings.local_llm_model,
            chat_model=settings.resolved_local_llm_chat_model,
            insight_model=settings.resolved_local_llm_insight_model,
            draft_model=settings.resolved_local_llm_draft_model,
            timeout_seconds=settings.openai_timeout_seconds,
            max_retries=settings.openai_max_retries,
            openai_api_key=settings.openai_api_key,
            openai_model=settings.openai_model,
            openai_insight_model=settings.resolved_openai_insight_model,
            openai_draft_model=settings.resolved_openai_draft_model,
            openai_vision_model=settings.resolved_openai_vision_model,
        )
    return MockLLMProvider()


def get_ai_provider() -> BaseLLMProvider:
    return get_llm_provider()
