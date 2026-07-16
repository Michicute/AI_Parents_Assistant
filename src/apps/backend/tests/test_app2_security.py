import os
from datetime import UTC, datetime, timedelta

os.environ["APP_SECRET_KEY"] = "test-app-secret"
os.environ["AI_PROVIDER"] = "mock"

from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import get_settings
from app.main import app
from app.models.domain import Intent, Role
from app.services.chat_sessions import add_turn, clear_sessions, get_all_turns, get_recent_turns, session_key
from app.services.intent_router import (
    IntentRoutingResult,
    OpenAIIntentClassifier,
    OpenAIStudentNameExtractor,
    StudentNameExtractionError,
    StudentNameExtractionResult,
)
from app.services.repositories import repository


client = TestClient(app)


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
TEACHER_HEADERS = auth_headers("teacher-1", "teacher.lan@englishcenter.test")
PARENT_HEADERS = auth_headers("parent-1", "parent.minh@englishcenter.test")


def test_app_unauthenticated_users_are_rejected() -> None:
    response = client.get("/api/me")
    assert response.status_code == 401


def test_app_protected_health_requires_authentication() -> None:
    unauthenticated = client.get("/api/health")
    authenticated = client.get("/api/health", headers=PARENT_HEADERS)
    assert unauthenticated.status_code == 401
    assert authenticated.status_code == 200
    assert authenticated.json()["service"] == "ai-parent-assistant-api-app"


def test_app_me_resolves_current_user_and_role_from_local_jwt() -> None:
    response = client.get("/api/me", headers=PARENT_HEADERS)
    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "parent-1"
    assert payload["email"] == "parent.minh@englishcenter.test"
    assert payload["role"] == "PARENT"


def test_app_invalid_login_token_is_rejected() -> None:
    response = client.get("/api/me", headers={"Authorization": "Bearer not-a-valid-token"})
    assert response.status_code == 401


def test_app_token_from_previous_backend_session_is_rejected() -> None:
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "aud": "authenticated",
            "sub": "parent-1",
            "email": "parent.minh@englishcenter.test",
            "role": "authenticated",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=30)).timestamp()),
            "session_epoch": "previous-session",
        },
        os.environ["APP_SECRET_KEY"],
        algorithm="HS256",
    )

    response = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_app_register_creates_parent_account_and_returns_token() -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": "parent.app.new@englishcenter.test",
            "password": "Parent123!",
            "full_name": "Parent app",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["access_token"]
    assert payload["user"]["role"] == "PARENT"
    assert repository.get_user_by_email("parent.app.new@englishcenter.test").hashed_password


def test_app_login_returns_token_for_valid_local_credentials() -> None:
    repository.create_local_user(
        email="login.parent@englishcenter.test",
        full_name="Login Parent",
        role=Role.parent,
        password="Parent123!",
    )
    response = client.post(
        "/api/auth/login",
        json={"email": "login.parent@englishcenter.test", "password": "Parent123!"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["access_token"]
    assert payload["user"]["email"] == "login.parent@englishcenter.test"


def test_app_cors_allows_docker_frontend_origin_for_login() -> None:
    response = client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://localhost:3002",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3002"


def test_app_cors_allows_dynamic_local_dev_frontend_origin_for_chat() -> None:
    response = client.options(
        "/api/ai/chat",
        headers={
            "Origin": "http://127.0.0.1:3004",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:3004"


def test_app_login_rejects_wrong_password() -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": "parent.minh@englishcenter.test", "password": "wrong-password"},
    )
    assert response.status_code == 401


def test_app_parent_can_list_only_their_children() -> None:
    response = client.get("/api/students/my-children", headers=PARENT_HEADERS)
    assert response.status_code == 200
    assert response.json() == [{"id": "student-a", "full_name": "Minh Nguyen", "level": "A2"}]


def test_app_parent_cannot_access_another_parents_student() -> None:
    response = client.get("/api/students/student-b/dashboard", headers=PARENT_HEADERS)
    assert response.status_code == 403


def test_app_teacher_cannot_access_unrelated_class() -> None:
    response = client.get("/api/classes/class-b/dashboard", headers=TEACHER_HEADERS)
    assert response.status_code == 403


def test_app_teacher_can_access_assigned_class() -> None:
    response = client.get("/api/classes/class-a/dashboard", headers=TEACHER_HEADERS)
    assert response.status_code == 200
    payload = response.json()
    assert payload["class_id"] == "class-a"
    assert payload["status"] == "authorized"
    assert set(payload["skill_averages"]) == {"reading", "listening", "speaking", "writing", "grammar", "vocabulary"}
    assert payload["total_students"] >= payload["alerted_students"]


def test_app_only_admin_can_access_admin_endpoints() -> None:
    parent_response = client.get("/api/admin/users", headers=PARENT_HEADERS)
    teacher_response = client.get("/api/admin/users", headers=TEACHER_HEADERS)
    admin_response = client.get("/api/admin/users", headers=ADMIN_HEADERS)
    assert parent_response.status_code == 403
    assert teacher_response.status_code == 403
    assert admin_response.status_code == 200


def test_app_admin_can_create_teacher_account() -> None:
    response = client.post(
        "/api/admin/teachers",
        headers=ADMIN_HEADERS,
        json={
            "email": "teacher.app.new@englishcenter.test",
            "password": "Password123!",
            "full_name": "New Teacher app",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["email"] == "teacher.app.new@englishcenter.test"
    assert payload["user"]["role"] == "TEACHER"
    assert payload["teacher"]["user_id"] == payload["user"]["id"]
    assert repository.get_user_by_email("teacher.app.new@englishcenter.test").role == "TEACHER"


def test_app_teacher_can_create_score_and_audit() -> None:
    audit_count = len(repository.audit_entries)

    response = client.post(
        "/api/students/student-a/scores",
        headers=TEACHER_HEADERS,
        json={
            "skill": "listening",
            "score": 79,
            "assessed_on": "2026-06-05",
            "teacher_comment": "Understands classroom instructions with light repetition.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["student_id"] == "student-a"
    assert payload["skill"] == "listening"
    assert repository.is_ai_insight_stale("student-a") is True
    assert len(repository.audit_entries) == audit_count + 1
    assert repository.audit_entries[-1]["resource_type"] == "skill_score"


def test_app_teacher_cannot_manage_student_in_unrelated_class() -> None:
    response = client.post(
        "/api/students/student-b/scores",
        headers=TEACHER_HEADERS,
        json={
            "skill": "reading",
            "score": 91,
            "teacher_comment": "Strong reading check.",
        },
    )
    assert response.status_code == 403


def test_app_parent_can_view_linked_students_answers() -> None:
    response = client.get("/api/students/student-a/answers", headers=PARENT_HEADERS)
    assert response.status_code == 200
    assert response.json()
    assert all(item["student_id"] == "student-a" for item in response.json())


def test_app_chat_uses_authorized_context_only() -> None:
    response = client.post(
        "/api/ai/chat",
        headers=PARENT_HEADERS,
        json={
            "message": "How is my child progress in reading?",
            "student_id": "student-a",
            "locale": "vi",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "student_progress"
    assert payload["intents"] == ["student_progress"]
    assert payload["retrieved_context"]
    assert all("student-b" not in item for item in payload["retrieved_context"])


def test_app_chat_returns_multi_intent_context(monkeypatch) -> None:
    def classify_multi(self, message: str, locale: str | None = None) -> IntentRoutingResult:
        return IntentRoutingResult(
            primary_intent=Intent.student_progress,
            intents=[Intent.student_progress, Intent.center_policy],
            confidence=0.91,
        )

    monkeypatch.setattr(OpenAIIntentClassifier, "classify", classify_multi)

    response = client.post(
        "/api/ai/chat",
        headers=PARENT_HEADERS,
        json={
            "message": "Tình hình học tập của con tôi như nào? Bữa tiếp theo nghỉ có cần xin phép không.",
            "student_id": "student-a",
            "locale": "vi",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "student_progress"
    assert payload["intents"] == ["student_progress", "center_policy"]
    context = " ".join(payload["retrieved_context"])
    assert "Authorized read-only score trend" in context
    assert "nghỉ" in context.lower() or "absence" in context.lower()


def test_app_chat_low_confidence_asks_for_clearer_question(monkeypatch) -> None:
    def classify_unclear(self, message: str, locale: str | None = None) -> IntentRoutingResult:
        return IntentRoutingResult(
            primary_intent=Intent.general_parent_support,
            intents=[Intent.general_parent_support],
            confidence=0.2,
        )

    monkeypatch.setattr(OpenAIIntentClassifier, "classify", classify_unclear)

    response = client.post(
        "/api/ai/chat",
        headers=PARENT_HEADERS,
        json={"message": "Cái đó thì sao?", "student_id": "student-a", "locale": "vi"},
    )

    assert response.status_code == 400
    assert "rõ hơn" in response.json()["detail"]


def test_app_chat_attendance_summary_retrieves_attendance(monkeypatch) -> None:
    def classify_attendance(self, message: str, locale: str | None = None) -> IntentRoutingResult:
        return IntentRoutingResult(
            primary_intent=Intent.attendance_summary,
            intents=[Intent.attendance_summary],
            confidence=0.9,
        )

    monkeypatch.setattr(OpenAIIntentClassifier, "classify", classify_attendance)

    response = client.post(
        "/api/ai/chat",
        headers=PARENT_HEADERS,
        json={"message": "Con tôi đi học đầy đủ không?", "student_id": "student-a", "locale": "vi"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["intent"] == "attendance_summary"
    assert payload["intents"] == ["attendance_summary"]
    assert "Authorized attendance records" in " ".join(payload["retrieved_context"])


def test_app_chat_generic_attendance_question_does_not_trigger_student_name_block(monkeypatch) -> None:
    def extract_no_names(
        self,
        message: str,
        *,
        authorized_student_names: list[str],
        locale: str | None = None,
    ) -> StudentNameExtractionResult:
        return StudentNameExtractionResult(mentioned_student_names=[], confidence=0.95)

    monkeypatch.setattr(OpenAIStudentNameExtractor, "extract", extract_no_names)

    response = client.post(
        "/api/ai/chat",
        headers=PARENT_HEADERS,
        json={"message": "Đi học có đầy đủ không?", "student_id": "student-a", "locale": "vi"},
    )

    assert response.status_code == 200
    assert "Authorized student: Minh Nguyen" in " ".join(response.json()["retrieved_context"])


def test_app_chat_linked_student_name_is_allowed_by_name_extractor(monkeypatch) -> None:
    def extract_minh(
        self,
        message: str,
        *,
        authorized_student_names: list[str],
        locale: str | None = None,
    ) -> StudentNameExtractionResult:
        return StudentNameExtractionResult(mentioned_student_names=["Minh"], confidence=0.95)

    monkeypatch.setattr(OpenAIStudentNameExtractor, "extract", extract_minh)

    response = client.post(
        "/api/ai/chat",
        headers=PARENT_HEADERS,
        json={"message": "Minh đi học đầy đủ không?", "student_id": "student-a", "locale": "vi"},
    )

    assert response.status_code == 200
    assert "Authorized student: Minh Nguyen" in " ".join(response.json()["retrieved_context"])


def test_app_chat_known_unlinked_student_name_is_blocked_by_name_extractor(monkeypatch) -> None:
    def extract_linh(
        self,
        message: str,
        *,
        authorized_student_names: list[str],
        locale: str | None = None,
    ) -> StudentNameExtractionResult:
        return StudentNameExtractionResult(mentioned_student_names=["Linh"], confidence=0.95)

    monkeypatch.setattr(OpenAIStudentNameExtractor, "extract", extract_linh)

    response = client.post(
        "/api/ai/chat",
        headers=PARENT_HEADERS,
        json={"message": "Linh học dạo này thế nào?", "student_id": "student-a", "locale": "vi"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Parent can only ask about their linked student"


def test_app_chat_name_extractor_failure_does_not_block_generic_question(monkeypatch) -> None:
    def extraction_failure(
        self,
        message: str,
        *,
        authorized_student_names: list[str],
        locale: str | None = None,
    ) -> StudentNameExtractionResult:
        raise StudentNameExtractionError("boom")

    monkeypatch.setattr(OpenAIStudentNameExtractor, "extract", extraction_failure)

    response = client.post(
        "/api/ai/chat",
        headers=PARENT_HEADERS,
        json={"message": "Đi học có đầy đủ không?", "student_id": "student-a", "locale": "vi"},
    )

    assert response.status_code == 200


def test_app_parent_chat_auto_scopes_to_linked_child() -> None:
    response = client.post(
        "/api/ai/chat",
        headers=PARENT_HEADERS,
        json={
            "message": "Tóm tắt tiến bộ gần đây của Minh.",
            "locale": "vi",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert any("Authorized student: Minh Nguyen" in item for item in payload["retrieved_context"])
    assert all("Linh Tran" not in item for item in payload["retrieved_context"])


def test_app_parent_chat_allows_selected_child_when_another_student_shares_name_token() -> None:
    create_response = client.post(
        "/api/admin/students",
        headers=ADMIN_HEADERS,
        json={
            "full_name": "Minh Chi",
            "level": "A2",
            "class_id": "class-a",
            "parent_user_id": "parent-2",
        },
    )
    assert create_response.status_code == 200

    response = client.post(
        "/api/ai/chat",
        headers=PARENT_HEADERS,
        json={
            "message": "Bài kiểm tra gần đây nhất của Minh như nào?",
            "student_id": "student-a",
            "locale": "vi",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert any("Authorized student: Minh Nguyen" in item for item in payload["retrieved_context"])


def test_app_parent_chat_does_not_treat_chi_tiet_as_student_chi() -> None:
    create_response = client.post(
        "/api/admin/students",
        headers=ADMIN_HEADERS,
        json={
            "full_name": "Minh Chi",
            "level": "A2",
            "class_id": "class-a",
            "parent_user_id": "parent-2",
        },
    )
    assert create_response.status_code == 200

    response = client.post(
        "/api/ai/chat",
        headers=PARENT_HEADERS,
        json={
            "message": "điểm chi tiết của Minh",
            "student_id": "student-a",
            "locale": "vi",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert any("Authorized student: Minh Nguyen" in item for item in payload["retrieved_context"])


def test_chat_session_keeps_full_history_but_recalls_two_latest_turns() -> None:
    clear_sessions()
    key = session_key(user_id="parent-1", student_id="student-a")

    add_turn(key, question="Câu hỏi 1", answer="Trả lời 1")
    add_turn(key, question="Câu hỏi 2", answer="Trả lời 2")
    add_turn(key, question="Câu hỏi 3", answer="Trả lời 3")

    assert [turn.question for turn in get_all_turns(key)] == ["Câu hỏi 1", "Câu hỏi 2", "Câu hỏi 3"]
    assert [turn.question for turn in get_recent_turns(key)] == ["Câu hỏi 2", "Câu hỏi 3"]


def test_app_parent_chat_rejects_known_other_named_student(monkeypatch) -> None:
    def extract_linh(
        self,
        message: str,
        *,
        authorized_student_names: list[str],
        locale: str | None = None,
    ) -> StudentNameExtractionResult:
        return StudentNameExtractionResult(mentioned_student_names=["Linh"], confidence=0.95)

    monkeypatch.setattr(OpenAIStudentNameExtractor, "extract", extract_linh)

    response = client.post(
        "/api/ai/chat",
        headers=PARENT_HEADERS,
        json={
            "message": "Tình hình học tập của Linh thế nào?",
            "locale": "vi",
        },
    )

    assert response.status_code == 403


def test_app_teacher_can_submit_student_assessment_and_parent_can_view_summary() -> None:
    submit_response = client.post(
        "/api/assessments/assessment-a2-progress-1/student-submissions",
        headers=TEACHER_HEADERS,
        json={
            "student_id": "student-a",
            "submitted_at": "2026-06-06T09:30:00Z",
            "answers": [
                {
                    "question_id": "question-reading-1",
                    "answer_text": "Tom walks in the park with his grandmother.",
                    "score_awarded": 9,
                    "teacher_feedback": "Strong reading comprehension.",
                },
                {
                    "question_id": "question-grammar-1",
                    "answer_text": "go",
                    "score_awarded": 4,
                    "teacher_feedback": "Needs more practice with past simple irregular verbs.",
                },
            ],
        },
    )

    assert submit_response.status_code == 200
    assert submit_response.json()["answers_saved"] == 2

    summary_response = client.get(
        "/api/students/student-a/assessment-summary",
        headers=PARENT_HEADERS,
    )

    assert summary_response.status_code == 200
    payload = summary_response.json()
    assert payload["student_id"] == "student-a"
    assert "reading" in payload["skill_summary"]
    assert "grammar" in payload["skill_summary"]
    assert payload["weaknesses"]


def test_app_teacher_can_update_assessment_question_and_parent_cannot() -> None:
    payload = {
        "question_text": "Updated reading question",
        "question_type": "essay",
        "choices": [],
        "expected_answer": "Updated expected answer",
        "skill_tag": "reading",
        "max_score": 12,
        "rubric_criteria": {"criteria": "Updated rubric"},
        "score_range": "[0,12]",
    }

    denied = client.patch("/api/questions/question-reading-1", headers=PARENT_HEADERS, json=payload)
    assert denied.status_code == 403

    updated = client.patch("/api/questions/question-reading-1", headers=TEACHER_HEADERS, json=payload)
    assert updated.status_code == 200
    assert updated.json()["question_text"] == "Updated reading question"
    assert updated.json()["max_score"] == 12

    denied_clear = client.delete("/api/assessments/assessment-a2-progress-1/questions", headers=PARENT_HEADERS)
    assert denied_clear.status_code == 403

    cleared = client.delete("/api/assessments/assessment-a2-progress-1/questions", headers=TEACHER_HEADERS)
    assert cleared.status_code == 200
    assert cleared.json()["questions_deleted"] > 0
    assert client.get("/api/assessments/assessment-a2-progress-1", headers=TEACHER_HEADERS).status_code == 200
    assert client.get("/api/assessments/assessment-a2-progress-1/questions", headers=TEACHER_HEADERS).json() == []


def test_app_low_assessment_score_does_not_create_parent_notification() -> None:
    submit_response = client.post(
        "/api/assessments/assessment-a2-progress-1/student-submissions",
        headers=TEACHER_HEADERS,
        json={
            "student_id": "student-a",
            "submitted_at": "2026-06-06T09:30:00Z",
            "answers": [
                {"question_id": "question-reading-1", "answer_text": "Wrong", "score_awarded": 3},
                {"question_id": "question-grammar-1", "answer_text": "go", "score_awarded": 4},
            ],
        },
    )

    assert submit_response.status_code == 200
    alert_status = submit_response.json()["alert_status"]
    assert alert_status is None

    notifications_response = client.get("/api/parent/notifications", headers=PARENT_HEADERS)
    assert notifications_response.status_code == 200
    notifications = notifications_response.json()
    assert not any(item["type"] == "assessment_threshold_alert" for item in notifications)


def test_app_teacher_can_send_class_action_draft_to_parent_notifications() -> None:
    draft_response = client.post(
        "/api/classes/class-a/action-drafts",
        headers=TEACHER_HEADERS,
        json={
            "action_type": "teacher_reminder",
            "content": "Lớp tuần này ôn lại từ vựng Unit 3.",
            "scheduled_for": "2026-06-06",
        },
    )
    assert draft_response.status_code == 200
    draft_id = draft_response.json()["id"]

    send_response = client.post(f"/api/classes/class-a/action-drafts/{draft_id}/send", headers=TEACHER_HEADERS)
    assert send_response.status_code == 200
    payload = send_response.json()
    assert payload["status"] == "sent"
    assert payload["students_targeted"] == 1
    assert payload["notifications_created"] == 1
    assert payload["zalo_not_linked"] == 1

    notifications_response = client.get("/api/parent/notifications", headers=PARENT_HEADERS)
    assert notifications_response.status_code == 200
    assert any(item["type"] == "teacher_message" and "Unit 3" in item["content"] for item in notifications_response.json())


def test_app_teacher_can_send_assessment_result_notice_to_parent_notifications() -> None:
    draft_response = client.post(
        "/api/classes/class-a/action-drafts",
        headers=TEACHER_HEADERS,
        json={
            "action_type": "assessment_result_notice",
            "content": "Bài kiểm tra Unit 3 đã được chấm. Minh cần ôn lại phần past simple.",
            "scheduled_for": "2026-06-06",
        },
    )
    assert draft_response.status_code == 200
    draft_id = draft_response.json()["id"]

    send_response = client.post(f"/api/classes/class-a/action-drafts/{draft_id}/send", headers=TEACHER_HEADERS)
    assert send_response.status_code == 200
    assert send_response.json()["status"] == "sent"

    notifications_response = client.get("/api/parent/notifications", headers=PARENT_HEADERS)
    assert notifications_response.status_code == 200
    notifications = notifications_response.json()
    assert any(
        item["type"] == "teacher_message"
        and "Thông báo kết quả chấm điểm" in item["title"]
        and "KẾT QUẢ CHẤM ĐIỂM" in item["content"]
        for item in notifications
    )


def test_app_parent_cannot_view_unlinked_student_assessment_summary() -> None:
    response = client.get(
        "/api/students/student-b/assessment-summary",
        headers=PARENT_HEADERS,
    )

    assert response.status_code == 403
