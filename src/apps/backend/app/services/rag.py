from hashlib import sha256
from math import sqrt
from pathlib import Path
import re
from uuid import uuid4

from fastapi import HTTPException, status
from openai import OpenAI

from app.core.config import get_settings
from app.services.repositories import repository


ALLOWED_DOCUMENT_TYPES = {
    "center_policy",
    "parent_handbook",
    "faq",
    "course_description",
    "announcement",
}
EMBEDDING_DIMENSIONS = 1536
EMBEDDING_MODEL = "text-embedding-3-small"
SUPPORTED_DOCUMENT_EXTENSIONS = {".md", ".markdown", ".txt"}


def create_document(*, title: str, document_type: str, content: str, locale: str, source_uri: str | None) -> dict:
    _assert_allowed_document_type(document_type)
    return repository.create_document(
        title=title,
        document_type=document_type,
        content=content,
        locale=locale,
        source_uri=source_uri,
    )


def ingest_document(document_id: str) -> int:
    document = repository.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    _assert_allowed_document_type(document["document_type"])

    chunk_contents = chunk_text(document["content"])
    embeddings = embed_texts(chunk_contents)
    chunks = []
    for index, (text, embedding) in enumerate(zip(chunk_contents, embeddings, strict=True)):
        chunks.append(
            {
                "id": f"chunk-{uuid4()}",
                "chunk_index": index,
                "content": text,
                "embedding": embedding,
                "metadata": {
                    "document_title": document["title"],
                    "document_type": document["document_type"],
                    "locale": document["locale"],
                    "source_uri": document["source_uri"],
                },
            }
        )
    return repository.replace_document_chunks(document_id=document_id, chunks=chunks)


def ingest_documents_from_folder(base_dir: str | Path | None = None) -> dict:
    root = Path(base_dir) if base_dir else _default_documents_dir()
    summary = {
        "documents_dir": str(root),
        "documents_processed": 0,
        "chunks_created": 0,
        "skipped_files": [],
    }
    if not root.exists():
        return summary

    for document_type in sorted(ALLOWED_DOCUMENT_TYPES):
        folder = root / document_type
        if not folder.exists():
            continue
        for path in sorted(folder.rglob("*")):
            if not _is_supported_document_file(path):
                continue
            content = path.read_text(encoding="utf-8").strip()
            if not content:
                summary["skipped_files"].append(str(path.relative_to(root)))
                continue
            document = repository.upsert_document_by_source_uri(
                title=path.stem.replace("_", " ").replace("-", " ").strip().title(),
                document_type=document_type,
                content=content,
                locale=_locale_from_path(path),
                source_uri=str(path.relative_to(root)),
            )
            summary["documents_processed"] += 1
            summary["chunks_created"] += ingest_document(document["id"])
    return summary


def search_rag(query: str, limit: int = 5) -> list:
    return repository.search_document_chunks(embedding=embed_text(query), limit=limit)


def chunk_text(text: str, *, max_words: int = 180, overlap_words: int = 30) -> list[str]:
    chunks: list[str] = []
    sections = [section.strip() for section in re.split(r"(?=^##\s+)", text, flags=re.MULTILINE) if section.strip()]
    for section in sections:
        words = section.split()
        if len(words) <= max_words:
            chunks.append(" ".join(words))
            continue

        start = 0
        while start < len(words):
            end = min(start + max_words, len(words))
            chunks.append(" ".join(words[start:end]))
            if end == len(words):
                break
            start = max(0, end - overlap_words)
    return chunks


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    settings = get_settings()
    provider = settings.embedding_provider.lower()
    if provider == "mock":
        return [_mock_embedding(text) for text in texts]
    if provider == "openai":
        if not settings.openai_api_key or settings.openai_api_key.startswith("replace-with-"):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OPENAI_API_KEY is required to generate document embeddings",
            )
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
        return [item.embedding for item in sorted(response.data, key=lambda item: item.index)]
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Unsupported EMBEDDING_PROVIDER. Use openai or mock.",
    )


def _mock_embedding(text: str) -> list[float]:
    vector = [0.0] * EMBEDDING_DIMENSIONS
    for token in text.lower().split():
        digest = sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % EMBEDDING_DIMENSIONS
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign
    norm = sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


def _assert_allowed_document_type(document_type: str) -> None:
    if document_type not in ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="RAG supports only unstructured center documents",
        )


def _default_documents_dir() -> Path:
    settings = get_settings()
    if settings.rag_documents_dir:
        return Path(settings.rag_documents_dir)
    return Path(__file__).resolve().parents[2] / "rag_documents"


def _is_supported_document_file(path: Path) -> bool:
    return (
        path.is_file()
        and not path.name.startswith(".")
        and path.suffix.lower() in SUPPORTED_DOCUMENT_EXTENSIONS
    )


def _locale_from_path(path: Path) -> str:
    suffixes = path.stem.split(".")
    if suffixes and suffixes[-1].lower() in {"en", "vi"}:
        return suffixes[-1].lower()
    return "en"
