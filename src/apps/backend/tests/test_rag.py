import os
from datetime import UTC, datetime, timedelta

os.environ["APP_SECRET_KEY"] = "test-app-secret"
os.environ["AI_PROVIDER"] = "mock"
os.environ["EMBEDDING_PROVIDER"] = "mock"

from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import get_settings
from app.main import app
from app.services.repositories import repository
from app.services.rag import chunk_text, ingest_documents_from_folder


client = TestClient(app)


def test_markdown_chunking_keeps_top_level_sections_separate() -> None:
    content = "# Policies\nIntro\n\n## Attendance\nLate after ten minutes.\n\n## Homework\nComplete work independently."

    chunks = chunk_text(content)

    assert chunks == [
        "# Policies Intro",
        "## Attendance Late after ten minutes.",
        "## Homework Complete work independently.",
    ]


def auth_headers(auth_subject: str, email: str) -> dict[str, str]:
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "aud": "authenticated",
            "sub": auth_subject,
            "email": email,
            "role": "authenticated",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=30)).timestamp()),
            "session_epoch": get_settings().app_session_epoch,
        },
        os.environ["APP_SECRET_KEY"],
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


ADMIN_HEADERS = auth_headers("admin-1", "admin@englishcenter.test")
PARENT_HEADERS = auth_headers("parent-1", "parent.minh@englishcenter.test")


def test_admin_can_create_ingest_and_search_center_document() -> None:
    create_response = client.post(
        "/api/documents",
        headers=ADMIN_HEADERS,
        json={
            "title": "Make-up Class FAQ",
            "document_type": "faq",
            "locale": "en",
            "content": "Parents can request a make-up class within seven days when a learner misses English class due to illness.",
        },
    )
    assert create_response.status_code == 200
    document_id = create_response.json()["id"]

    ingest_response = client.post(f"/api/documents/{document_id}/ingest", headers=ADMIN_HEADERS)
    assert ingest_response.status_code == 200
    assert ingest_response.json()["chunks_created"] == 1

    search_response = client.post(
        "/api/rag/search",
        headers=PARENT_HEADERS,
        json={"query": "How do parents request a make-up class?", "limit": 5},
    )
    assert search_response.status_code == 200
    payload = search_response.json()
    assert payload["answer"] == "ok"
    assert payload["chunks"][0]["document_id"] == document_id
    assert payload["chunks"][0]["document_type"] == "faq"


def test_rag_search_returns_information_unavailable_when_no_relevant_chunk_exists() -> None:
    response = client.post(
        "/api/rag/search",
        headers=PARENT_HEADERS,
        json={"query": "cafeteria lunch menu transportation bus route", "limit": 5},
    )

    assert response.status_code == 200
    assert response.json() == {"answer": "information unavailable", "chunks": []}


def test_parent_cannot_create_rag_document() -> None:
    response = client.post(
        "/api/documents",
        headers=PARENT_HEADERS,
        json={
            "title": "Blocked",
            "document_type": "center_policy",
            "content": "Parents should not be able to create center documents.",
        },
    )

    assert response.status_code == 403


def test_rag_rejects_structured_student_document_types() -> None:
    response = client.post(
        "/api/documents",
        headers=ADMIN_HEADERS,
        json={
            "title": "Scores",
            "document_type": "scores",
            "content": "Structured scores must stay in PostgreSQL records, not RAG.",
        },
    )

    assert response.status_code == 422


def test_folder_ingest_reads_supported_files_from_allowed_type_folders(tmp_path) -> None:
    faq_dir = tmp_path / "faq"
    faq_dir.mkdir()
    (faq_dir / "makeup_class.md").write_text("Make-up class requests are available for missed English lessons.", encoding="utf-8")
    (faq_dir / ".gitkeep").write_text("", encoding="utf-8")

    summary = ingest_documents_from_folder(tmp_path)

    assert summary["documents_processed"] == 1
    assert summary["chunks_created"] == 1


def test_rag_search_can_filter_chunks_by_document_type_metadata() -> None:
    faq_response = client.post(
        "/api/documents",
        headers=ADMIN_HEADERS,
        json={
            "title": "Make-up Class FAQ",
            "document_type": "faq",
            "locale": "en",
            "content": "Make-up class information for missed English lessons.",
        },
    )
    announcement_response = client.post(
        "/api/documents",
        headers=ADMIN_HEADERS,
        json={
            "title": "Make-up Class Announcement",
            "document_type": "announcement",
            "locale": "en",
            "content": "Make-up class information for the upcoming parent meeting week.",
        },
    )
    assert faq_response.status_code == 200
    assert announcement_response.status_code == 200
    client.post(f"/api/documents/{faq_response.json()['id']}/ingest", headers=ADMIN_HEADERS)
    client.post(f"/api/documents/{announcement_response.json()['id']}/ingest", headers=ADMIN_HEADERS)

    announcement_docs = repository.search_documents(
        "make-up class information",
        document_types=["announcement"],
    )
    policy_docs = repository.search_documents(
        "make-up class information",
        document_types=["center_policy", "faq", "course_description"],
    )

    assert announcement_docs
    assert {doc.source_type for doc in announcement_docs} == {"announcement"}
    assert policy_docs
    assert {doc.source_type for doc in policy_docs} <= {"center_policy", "faq", "course_description"}
