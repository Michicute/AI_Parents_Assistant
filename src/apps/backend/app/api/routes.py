import secrets
from datetime import UTC, date, datetime, timedelta
import re
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
import httpx
from jose import jwt
from app.core.config import get_settings
from app.core.password import verify_password
from app.core.security import (
    assert_student_access,
    assert_admin_access,
    assert_teacher_can_access_class,
    get_current_user,
    require_admin,
    require_parent,
    require_student,
    require_teacher,
)
from app.models.domain import Intent, Principal, Role
from app.schemas.api import (
    AdminAssignTeacherClassRequest,
    AdminCreateClassRequest,
    AdminCreateParentRequest,
    AuthLoginRequest,
    AuthRegisterRequest,
    AdminCreateParentResponse,
    AdminCreateStudentRequest,
    AdminCreateTeacherResponse,
    AdminCreateUserRequest,
    AdminLinkParentStudentRequest,
    AiInsightApprovalRequest,
    AiInsightResponse,
    AssessmentCreateRequest,
    AssessmentAttemptEventRequest,
    AssessmentImportDraftResponse,
    AssessmentImportRequest,
    AssessmentImportResponse,
    AttendanceSaveRequest,
    AttendanceSessionResponse,
    AssessmentPrintViewResponse,
    AssessmentQuestionCreateRequest,
    AssessmentQuestionUpdateRequest,
    AssessmentQuestionResponse,
    AssessmentResponse,
    ChatRequest,
    ChatResponse,
    ClassSummary,
    CourseSummary,
    ClassDashboardResponse,
    DevLoginRequest,
    DevLoginResponse,
    DocumentCreateRequest,
    DocumentIngestResponse,
    DocumentResponse,
    HealthResponse,
    RagFolderIngestResponse,
    RagSearchChunk,
    RagSearchRequest,
    RagSearchResponse,
    OcrDraftAnswer,
    OcrDraftResponse,
    PublicAssessmentResponse,
    PublicAssessmentQuestionResponse,
    ParentNotificationResponse,
    ScoreCreateRequest,
    ScoreResponse,
    ScoreUpdateRequest,
    StudentAnswerCreateRequest,
    StudentAnswerResponse,
    StudentAssessmentDetailResponse,
    StudentAssessmentAttemptResponse,
    StudentAssessmentListItem,
    StudentAssessmentSubmissionRequest,
    StudentAssessmentSubmissionResponse,
    StudentAssessmentSummaryResponse,
    StudentDashboardResponse,
    StudentSummary,
    TeacherClassActionDraftRequest,
    TeacherClassActionDraftResponse,
    TeacherClassActionSendResponse,
    TeacherDashboardAlertPublishResponse,
    TeacherDashboardOverviewResponse,
    StudentZaloQrResponse,
    UserSummary,
    ZaloBotSessionResponse,
    ZaloBotSessionUpsertRequest,
    ZaloChannelLinkResponse,
    ZaloChatThreadResponse,
    ZaloLinkSessionCompleteRequest,
    ZaloLinkSessionCreateRequest,
    ZaloLinkSessionFailRequest,
    ZaloLinkSessionResolveOtpRequest,
    ZaloLinkSessionResolveOtpResponse,
    ZaloLinkSessionResponse,
    ZaloChatRequest,
    ZaloChatResponse,
    ZaloMessageLogRequest,
    ZaloMessageResponse,
)
from app.services.ai_provider import get_ai_provider
from app.services.assessment_scoring import auto_score_answer
from app.services.assessment_import import assessment_draft_from_uploads, answer_draft_from_uploads
from app.services.assessment_insights import ASSESSMENT_PROGRESS_INSIGHT, approve_assessment_progress_insight, generate_assessment_progress_insight
from app.services.chat_sessions import add_turn, clear_user_sessions, get_recent_turns, recent_turns_context, session_key
from app.services.guardrails import check_input, check_output, check_retrieval
from app.services.intent_router import route_intents
from app.services.rag import create_document as create_rag_document
from app.services.rag import ingest_document, ingest_documents_from_folder, search_rag
from app.services.alerts import publish_student_class_alerts, publish_teacher_dashboard_alerts
from app.services.parent_notifications import publish_teacher_class_message
from app.services.repositories import repository
from app.services.tools import retrieve_authorized_context
from app.services.zalo_format import format_for_zalo

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="ai-parent-assistant-api-app")


@router.get("/me", response_model=UserSummary)
def me(principal: Principal = Depends(get_current_user)) -> UserSummary:
    user = repository.get_user(principal.user_id)
    return _user_summary(user) if user else UserSummary(id=principal.user_id, email=principal.email, role=principal.role)


@router.post("/auth/register", response_model=DevLoginResponse)
def register(request: AuthRegisterRequest) -> DevLoginResponse:
    try:
        user = repository.create_local_user(
            email=request.email,
            full_name=request.full_name,
            role=Role.parent,
            password=request.password,
        )
        repository.create_parent_profile(user=user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return DevLoginResponse(access_token=_create_access_token(user), user=_user_summary(user))


@router.post("/auth/login", response_model=DevLoginResponse)
def login(request: AuthLoginRequest) -> DevLoginResponse:
    user = repository.get_user_by_email(request.email)
    if user is None or not user.is_active or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return DevLoginResponse(access_token=_create_access_token(user), user=_user_summary(user))


@router.post("/dev/login", response_model=DevLoginResponse)
def dev_login(request: DevLoginRequest) -> DevLoginResponse:
    settings = get_settings()
    if settings.app_env != "development":
        raise HTTPException(status_code=404, detail="Not found")
    jwt_secret = settings.app_secret_key
    if not jwt_secret:
        raise HTTPException(status_code=500, detail="JWT secret is required for dev login")

    user = repository.get_user_by_email(request.email)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Demo user not found")
    if len(request.password) < 8:
        raise HTTPException(status_code=401, detail="Demo password must be at least 8 characters")

    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "aud": "authenticated",
            "sub": user.id,
            "email": user.email,
            "role": "authenticated",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=8)).timestamp()),
            "session_epoch": settings.app_session_epoch,
        },
        jwt_secret,
        algorithm="HS256",
    )
    return DevLoginResponse(access_token=token, user=_user_summary(user))


@router.get("/students/my-children", response_model=list[StudentSummary])
def my_children(principal: Principal = Depends(require_parent)) -> list[StudentSummary]:
    students = repository.get_linked_students_for_parent(principal.user_id)
    return [StudentSummary(id=student.id, full_name=student.full_name, level=student.level) for student in students]


@router.get("/student/assessments", response_model=list[StudentAssessmentListItem])
def my_student_assessments(principal: Principal = Depends(require_student)) -> list[StudentAssessmentListItem]:
    student = _current_student_for_principal(principal)
    items: list[StudentAssessmentListItem] = []
    for assessment in repository.get_assessments_for_student(student.id):
        questions = repository.get_public_questions_for_assessment(assessment["id"])
        summary = repository.get_assessment_summary_for_student(student.id, assessment["id"])
        items.append(
            StudentAssessmentListItem(
                id=assessment["id"],
                class_id=assessment["class_id"],
                title=assessment["title"],
                description=assessment["description"],
                assessment_date=assessment["assessment_date"],
                duration_minutes=assessment["duration_minutes"],
                lockdown_enabled=assessment["lockdown_enabled"],
                max_violation_count=assessment["max_violation_count"],
                question_count=len(questions),
                submitted=bool(summary["assessments"]),
            )
        )
    return items


@router.get("/student/assessments/{assessment_id}", response_model=StudentAssessmentDetailResponse)
def my_student_assessment_detail(
    assessment_id: str,
    principal: Principal = Depends(require_student),
) -> StudentAssessmentDetailResponse:
    student = _current_student_for_principal(principal)
    assessment = _get_assessment_for_student(assessment_id, student.id)
    summary = repository.get_assessment_summary_for_student(student.id, assessment_id)
    submitted_answers = repository.get_answers_for_student_assessment(student.id, assessment_id)
    attempt = _refresh_attempt_if_expired(repository.get_assessment_attempt(student_id=student.id, assessment_id=assessment_id))
    return StudentAssessmentDetailResponse(
        assessment=_public_assessment_response(assessment),
        student=StudentSummary(id=student.id, full_name=student.full_name, level=student.level),
        questions=[PublicAssessmentQuestionResponse(**question) for question in repository.get_public_questions_for_assessment(assessment_id)],
        submitted=bool(summary["assessments"]),
        submitted_answers=[
            {
                "question_id": answer["assessment_question_id"],
                "answer_text": answer["answer_text"],
                "submitted_at": answer["submitted_at"],
            }
            for answer in submitted_answers
        ],
        attempt=StudentAssessmentAttemptResponse(**attempt) if attempt else None,
        server_now=datetime.now(UTC),
    )


@router.post("/student/assessments/{assessment_id}/attempts/start", response_model=StudentAssessmentAttemptResponse)
def start_my_student_assessment_attempt(
    assessment_id: str,
    principal: Principal = Depends(require_student),
) -> StudentAssessmentAttemptResponse:
    student = _current_student_for_principal(principal)
    assessment = _get_assessment_for_student(assessment_id, student.id)
    if repository.get_answers_for_student_assessment(student.id, assessment_id):
        raise HTTPException(status_code=409, detail="Assessment has already been submitted")
    existing = _refresh_attempt_if_expired(repository.get_assessment_attempt(student_id=student.id, assessment_id=assessment_id))
    if existing is not None:
        if existing["status"] != "in_progress":
            raise HTTPException(status_code=409, detail=f"Assessment attempt is {existing['status']}")
        return StudentAssessmentAttemptResponse(**existing)
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=assessment["duration_minutes"]) if assessment["duration_minutes"] else None
    attempt = repository.create_assessment_attempt(
        student_id=student.id,
        assessment_id=assessment_id,
        started_at=now,
        expires_at=expires_at,
    )
    repository.create_assessment_attempt_event(
        attempt_id=attempt["id"],
        event_type="started",
        occurred_at=now,
        metadata={},
    )
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="start_attempt",
        resource_type="student_assessment",
        resource_id=assessment_id,
        metadata={"student_id": student.id, "attempt_id": attempt["id"]},
    )
    return StudentAssessmentAttemptResponse(**attempt)


@router.post("/student/assessments/{assessment_id}/attempts/events", response_model=StudentAssessmentAttemptResponse)
def log_my_student_assessment_attempt_event(
    assessment_id: str,
    request: AssessmentAttemptEventRequest,
    principal: Principal = Depends(require_student),
) -> StudentAssessmentAttemptResponse:
    student = _current_student_for_principal(principal)
    assessment = _get_assessment_for_student(assessment_id, student.id)
    attempt = _refresh_attempt_if_expired(repository.get_assessment_attempt(student_id=student.id, assessment_id=assessment_id))
    if attempt is None:
        raise HTTPException(status_code=409, detail="Assessment attempt has not started")
    if attempt["status"] != "in_progress":
        raise HTTPException(status_code=409, detail=f"Assessment attempt is {attempt['status']}")
    violation_events = {"fullscreen_exit", "tab_hidden", "window_blur", "copy_attempt", "paste_attempt", "context_menu_attempt"}
    updated = repository.create_assessment_attempt_event(
        attempt_id=attempt["id"],
        event_type=request.event_type,
        occurred_at=request.occurred_at or datetime.now(UTC),
        metadata=request.metadata,
        increment_violation=assessment["lockdown_enabled"] and request.event_type in violation_events,
    )
    if assessment["lockdown_enabled"] and assessment["max_violation_count"] is not None and updated["violation_count"] > assessment["max_violation_count"]:
        updated = repository.update_assessment_attempt(updated["id"], status="locked") or updated
        repository.create_audit_log(
            actor_id=principal.user_id,
            actor_role=principal.role,
            action="lock_attempt",
            resource_type="student_assessment",
            resource_id=assessment_id,
            metadata={"student_id": student.id, "attempt_id": updated["id"], "violation_count": updated["violation_count"]},
        )
    return StudentAssessmentAttemptResponse(**updated)


@router.post("/student/assessments/{assessment_id}/submit", response_model=StudentAssessmentSubmissionResponse)
def submit_my_student_assessment(
    assessment_id: str,
    request: StudentAssessmentSubmissionRequest,
    principal: Principal = Depends(require_student),
) -> StudentAssessmentSubmissionResponse:
    student = _current_student_for_principal(principal)
    if request.student_id != student.id:
        raise HTTPException(status_code=403, detail="Students can submit only their own assessment")
    assessment = _get_assessment_for_student(assessment_id, student.id)
    if repository.get_answers_for_student_assessment(student.id, assessment_id):
        raise HTTPException(status_code=409, detail="Assessment has already been submitted")
    attempt = _validate_student_attempt_for_submission(
        student_id=student.id,
        assessment_id=assessment_id,
        attempt_id=request.attempt_id,
        allow_expired=True,
    )
    return _save_assessment_submission(
        assessment_id=assessment_id,
        assessment=assessment,
        request=request,
        principal=principal,
        audit_action="student_submit",
        attempt_id=attempt["id"] if attempt else None,
    )


@router.get("/students/{student_id}", response_model=StudentSummary)
def get_student(student_id: str, principal: Principal = Depends(get_current_user)) -> StudentSummary:
    student = repository.get_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    assert_student_access(principal, student.id, student.class_ids)
    return StudentSummary(id=student.id, full_name=student.full_name, level=student.level)


@router.post("/integrations/zalo/link-sessions", response_model=ZaloLinkSessionResponse)
def create_zalo_link_session(
    request: ZaloLinkSessionCreateRequest,
    principal: Principal = Depends(require_admin),
) -> ZaloLinkSessionResponse:
    assert_admin_access(principal.user_id)
    student = repository.get_student(request.student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    settings = get_settings()
    session = repository.create_zalo_link_session(
        student_id=student.id,
        created_by_user_id=principal.user_id,
        session_token=secrets.token_urlsafe(24),
        expires_at=datetime.now(UTC) + timedelta(minutes=settings.zalo_link_session_ttl_minutes),
    )

    try:
        service_payload = _create_zalo_service_session(session, student)
    except httpx.HTTPError as exc:
        repository.update_zalo_link_session(session.id, status="failed", error_message="Zalo service is unavailable")
        raise HTTPException(status_code=502, detail="Zalo service is unavailable") from exc

    service_status = service_payload.get("status", "link_ready")
    service_error = service_payload.get("error_message") or (
        "Bot Zalo chưa sẵn sàng. Admin cần đăng nhập Zalo bot trước." if service_status == "failed" else None
    )
    updated = repository.update_zalo_link_session(
        session.id,
        status=service_status,
        qr_code_url=service_payload.get("qr_code_url"),
        deep_link_url=service_payload.get("deep_link_url"),
        linking_message=service_payload.get("linking_message"),
        bot_display_name=service_payload.get("bot_display_name"),
        error_message=service_error,
    )
    return _zalo_session_response(updated or session)


@router.get("/integrations/zalo/link-sessions/{session_token}", response_model=ZaloLinkSessionResponse)
def get_zalo_link_session(
    session_token: str,
    principal: Principal = Depends(get_current_user),
) -> ZaloLinkSessionResponse:
    session = repository.get_zalo_link_session_by_token(session_token)
    if session is None:
        raise HTTPException(status_code=404, detail="Zalo link session not found")
    student = repository.get_student(session.student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    assert_student_access(principal, student.id, student.class_ids)
    if session.status not in {"connected", "failed", "expired"} and _is_expired(session.expires_at):
        session = repository.update_zalo_link_session(session.id, status="expired", error_message="Session expired") or session
    return _zalo_session_response(session)


@router.get("/students/{student_id}/channel-links", response_model=list[ZaloChannelLinkResponse])
def get_student_channel_links(
    student_id: str,
    principal: Principal = Depends(get_current_user),
) -> list[ZaloChannelLinkResponse]:
    student = repository.get_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    assert_student_access(principal, student.id, student.class_ids)
    return [_zalo_channel_link_response(link) for link in repository.get_channel_links_for_student(student.id, "zalo")]


@router.post("/integrations/zalo/link-sessions/{session_id}/complete", response_model=ZaloLinkSessionResponse)
def complete_zalo_link_session(
    session_id: str,
    request: ZaloLinkSessionCompleteRequest,
    authorization: str | None = Header(default=None),
) -> ZaloLinkSessionResponse:
    _assert_internal_authorized(authorization)
    session = repository.get_zalo_link_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Zalo link session not found")
    if _is_expired(session.expires_at):
        expired = repository.update_zalo_link_session(session.id, status="expired", error_message="Session expired") or session
        raise HTTPException(status_code=400, detail=_zalo_session_response(expired).model_dump(mode="json"))

    link = repository.create_or_update_student_channel_link(
        student_id=session.student_id,
        sender_id=request.sender_id,
        zalo_display_name=request.zalo_display_name,
        linked_by_user_id=session.created_by_user_id,
        linked_via_session_id=session.id,
    )
    updated = repository.update_zalo_link_session(
        session.id,
        status="connected",
        otp_used_at=datetime.now(UTC),
        sender_id=link.sender_id,
        zalo_display_name=link.zalo_display_name,
        error_message=None,
    )
    return _zalo_session_response(updated or session)


@router.post("/integrations/zalo/link-sessions/{session_id}/fail", response_model=ZaloLinkSessionResponse)
def fail_zalo_link_session(
    session_id: str,
    request: ZaloLinkSessionFailRequest,
    authorization: str | None = Header(default=None),
) -> ZaloLinkSessionResponse:
    _assert_internal_authorized(authorization)
    session = repository.update_zalo_link_session(session_id, status=request.status, error_message=request.error_message)
    if session is None:
        raise HTTPException(status_code=404, detail="Zalo link session not found")
    return _zalo_session_response(session)


@router.post("/integrations/zalo/link-sessions/resolve-otp", response_model=ZaloLinkSessionResolveOtpResponse)
def resolve_zalo_link_session_otp(
    request: ZaloLinkSessionResolveOtpRequest,
    authorization: str | None = Header(default=None),
) -> ZaloLinkSessionResolveOtpResponse:
    _assert_internal_authorized(authorization)
    session = repository.get_zalo_link_session_by_otp(request.otp_code.strip())
    if session is None:
        raise HTTPException(status_code=404, detail="OTP khong hop le hoac da het han")
    if _is_expired(session.expires_at) or session.status in {"connected", "expired"} or session.otp_used_at is not None:
        raise HTTPException(status_code=400, detail="OTP khong con hieu luc")
    if session.otp_expires_at and _is_expired(session.otp_expires_at):
        raise HTTPException(status_code=400, detail="OTP da het han")

    student = repository.get_student(session.student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    return ZaloLinkSessionResolveOtpResponse(
        session_id=session.id,
        session_token=session.session_token,
        student_id=student.id,
        student_name=student.full_name,
        student_level=student.level,
        expires_at=session.expires_at,
    )


@router.post("/integrations/zalo/messages", response_model=ZaloMessageResponse)
def log_zalo_message(
    request: ZaloMessageLogRequest,
    authorization: str | None = Header(default=None),
) -> ZaloMessageResponse:
    _assert_internal_authorized(authorization)
    message = repository.create_zalo_message(
        sender_id=request.sender_id,
        direction=request.direction,
        content=request.content,
        student_id=request.student_id,
        channel_link_id=request.channel_link_id,
        zalo_display_name=request.zalo_display_name,
        raw_message_id=request.raw_message_id,
        sent_at=request.sent_at,
    )
    return _zalo_message_response(message)


@router.get("/admin/zalo/threads", response_model=list[ZaloChatThreadResponse])
def list_zalo_chat_threads(principal: Principal = Depends(require_admin)) -> list[ZaloChatThreadResponse]:
    return [ZaloChatThreadResponse(**thread) for thread in repository.list_zalo_chat_threads()]


@router.get("/admin/zalo/messages", response_model=list[ZaloMessageResponse])
def list_zalo_thread_messages(
    sender_id: str,
    student_id: str | None = None,
    limit: int = 200,
    principal: Principal = Depends(require_admin),
) -> list[ZaloMessageResponse]:
    messages = repository.get_zalo_messages_for_thread(
        student_id=student_id,
        sender_id=sender_id,
        limit=limit,
    )
    return [_zalo_message_response(message) for message in messages]


@router.get("/integrations/zalo/bot-session/{account_label}", response_model=ZaloBotSessionResponse | None)
def get_zalo_bot_session(
    account_label: str,
    authorization: str | None = Header(default=None),
):
    _assert_internal_authorized(authorization)
    session = repository.get_zalo_bot_session(account_label)
    return _zalo_bot_session_response(session) if session else None


@router.put("/integrations/zalo/bot-session/{account_label}", response_model=ZaloBotSessionResponse)
def upsert_zalo_bot_session(
    account_label: str,
    request: ZaloBotSessionUpsertRequest,
    authorization: str | None = Header(default=None),
) -> ZaloBotSessionResponse:
    _assert_internal_authorized(authorization)
    encrypted_session_payload = request.encrypted_session_payload if "encrypted_session_payload" in request.model_fields_set else repository._UNSET
    bot_chat_url = request.bot_chat_url if "bot_chat_url" in request.model_fields_set else repository._UNSET
    bot_display_name = request.bot_display_name if "bot_display_name" in request.model_fields_set else repository._UNSET
    session = repository.upsert_zalo_bot_session(
        account_label=account_label,
        adapter=request.adapter,
        status=request.status,
        encrypted_session_payload=encrypted_session_payload,
        bot_chat_url=bot_chat_url,
        bot_display_name=bot_display_name,
        last_login_at=request.last_login_at,
        last_error=request.last_error,
    )
    return _zalo_bot_session_response(session)


@router.get("/integrations/zalo/channel-links/by-sender/{sender_id}", response_model=ZaloChannelLinkResponse | None)
def get_zalo_channel_link_by_sender(
    sender_id: str,
    authorization: str | None = Header(default=None),
) -> ZaloChannelLinkResponse | None:
    _assert_internal_authorized(authorization)
    link = repository.get_active_channel_link_for_sender(sender_id)
    return _zalo_channel_link_response(link) if link else None


@router.post("/integrations/zalo/chat", response_model=ZaloChatResponse)
def chat_from_zalo(
    request: ZaloChatRequest,
    authorization: str | None = Header(default=None),
) -> ZaloChatResponse:
    _assert_internal_authorized(authorization)
    link = repository.get_active_channel_link_for_sender(request.sender_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Zalo sender is not linked to a student")

    audit_actor_id = repository.get_first_parent_user_id_for_student(link.student_id) or link.linked_by_user_id
    audit_actor = repository.get_user(audit_actor_id) if audit_actor_id else None
    if audit_actor is None:
        raise HTTPException(status_code=409, detail="Zalo link is not associated with an auditable user")

    session_user_id = f"zalo:{link.id}"
    principal = Principal(
        user_id=session_user_id,
        email=f"{request.sender_id}@zalo.local",
        role=Role.parent,
        linked_student_ids=[link.student_id],
    )
    chat_request = ChatRequest(message=request.message, student_id=link.student_id, locale=request.locale or "vi")
    response = _generate_chat_response(
        chat_request,
        principal,
        clarification_as_answer=True,
        audit_actor_id=audit_actor.id,
        audit_actor_role=audit_actor.role,
        session_user_id=session_user_id,
        audit_metadata={
            "channel": "zalo",
            "zalo_sender_id": request.sender_id,
            "channel_link_id": link.id,
        },
        channel="zalo",
    )
    formatted = format_for_zalo(response.answer)
    return ZaloChatResponse(**response.model_dump(exclude={"answer"}), answer=formatted.answer, styles=formatted.styles)



@router.get("/students/{student_id}/dashboard", response_model=StudentDashboardResponse)
def student_dashboard(
    student_id: str,
    principal: Principal = Depends(get_current_user),
) -> StudentDashboardResponse:
    student = repository.get_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    assert_student_access(principal, student.id, student.class_ids)
    progress = repository.get_progress_snapshot(student.id)
    attendance = [
        item.model_dump(mode="json")
        for item in repository.get_attendance(student.id)
    ]
    feedback = [
        item.model_dump(mode="json")
        for item in repository.get_teacher_feedback(student.id)
    ]
    schedule = repository.get_parent_dashboard_schedule(student.id, start=date.today(), upcoming_limit=2)
    return StudentDashboardResponse(
        student=StudentSummary(id=student.id, full_name=student.full_name, level=student.level),
        progress=progress,
        attendance=attendance,
        teacher_feedback=feedback,
        upcoming_classes=schedule["upcoming_classes"],
        class_alerts=schedule["class_alerts"],
        assignment_completion=repository.get_assignment_completion_for_student(student.id),
    )


@router.get("/students/{student_id}/zalo-qr", response_model=StudentZaloQrResponse)
def get_student_zalo_qr(
    student_id: str,
    principal: Principal = Depends(get_current_user),
) -> StudentZaloQrResponse:
    student = repository.get_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    assert_student_access(principal, student.id, student.class_ids)

    active_links = repository.get_channel_links_for_student(student.id, "zalo")
    if any(link.status == "active" for link in active_links):
        link = next(link for link in active_links if link.status == "active")
        return StudentZaloQrResponse(
            student_id=student.id,
            status="connected",
            connected=True,
            sender_id=link.sender_id,
            zalo_display_name=link.zalo_display_name,
        )

    existing = repository.get_active_zalo_link_session_for_student(student.id)
    if existing:
        return StudentZaloQrResponse(
            student_id=student.id,
            status=existing.status,
            connected=False,
            qr_code_url=existing.qr_code_url,
            deep_link_url=existing.deep_link_url,
            linking_message=existing.linking_message,
            bot_display_name=existing.bot_display_name,
            session_token=existing.session_token,
            otp_code=existing.otp_code,
            otp_expires_at=existing.otp_expires_at,
            expires_at=existing.expires_at,
            error_message=existing.error_message,
        )

    settings = get_settings()
    session = repository.create_zalo_link_session(
        student_id=student.id,
        created_by_user_id=principal.user_id,
        session_token=secrets.token_urlsafe(24),
        expires_at=datetime.now(UTC) + timedelta(minutes=settings.zalo_link_session_ttl_minutes),
    )

    try:
        service_payload = _create_zalo_service_session(session, student)
    except httpx.HTTPError:
        repository.update_zalo_link_session(session.id, status="failed", error_message="Zalo service is unavailable")
        return StudentZaloQrResponse(
            student_id=student.id,
            status="failed",
            connected=False,
            session_token=session.session_token,
            otp_code=session.otp_code,
            otp_expires_at=session.otp_expires_at,
            expires_at=session.expires_at,
            error_message="Zalo service is unavailable",
        )

    service_status = service_payload.get("status", "link_ready")
    service_error = service_payload.get("error_message") or (
        "Bot Zalo chưa sẵn sàng. Admin cần đăng nhập Zalo bot trước." if service_status == "failed" else None
    )
    updated = repository.update_zalo_link_session(
        session.id,
        status=service_status,
        qr_code_url=service_payload.get("qr_code_url"),
        deep_link_url=service_payload.get("deep_link_url"),
        linking_message=service_payload.get("linking_message"),
        bot_display_name=service_payload.get("bot_display_name"),
        error_message=service_error,
    )
    final = updated or session
    return StudentZaloQrResponse(
        student_id=student.id,
        status=final.status,
        connected=False,
        qr_code_url=final.qr_code_url,
        deep_link_url=final.deep_link_url,
        linking_message=final.linking_message,
        bot_display_name=final.bot_display_name,
        session_token=final.session_token,
        otp_code=final.otp_code,
        otp_expires_at=final.otp_expires_at,
        expires_at=final.expires_at,
        error_message=final.error_message,
    )


@router.get("/classes/{class_id}/dashboard", response_model=ClassDashboardResponse)
def class_dashboard(class_id: str, principal: Principal = Depends(require_teacher)) -> ClassDashboardResponse:
    assert_teacher_can_access_class(principal.user_id, class_id)
    students = repository.get_students_for_class(class_id)
    overview = repository.get_teacher_dashboard_overview(principal.user_id, start=date.today(), days=1)
    alerted_student_ids = {
        alert["student_id"]
        for alert in overview["alerts"]
        if alert["class_id"] == class_id
    }
    return ClassDashboardResponse(
        class_id=class_id,
        status="authorized",
        skill_averages=repository.get_class_skill_averages(class_id),
        alerted_students=len(alerted_student_ids),
        total_students=len(students),
    )


@router.get("/teacher/classes", response_model=list[ClassSummary])
def teacher_classes(principal: Principal = Depends(require_teacher)) -> list[ClassSummary]:
    return [
        ClassSummary(
            id=class_record.id,
            course_id=class_record.course_id,
            name=class_record.name,
            location=class_record.location,
            schedule_note=class_record.schedule_note,
        )
        for class_record in repository.get_classes_for_teacher(principal.user_id)
    ]


@router.get("/teacher/dashboard-overview", response_model=TeacherDashboardOverviewResponse)
def teacher_dashboard_overview(
    start: date | None = None,
    days: int = 7,
    principal: Principal = Depends(require_teacher),
) -> TeacherDashboardOverviewResponse:
    if days < 1 or days > 14:
        raise HTTPException(status_code=400, detail="days must be between 1 and 14")
    overview = repository.get_teacher_dashboard_overview(principal.user_id, start=start or date.today(), days=days)
    return TeacherDashboardOverviewResponse(**overview)


@router.post("/teacher/dashboard-overview/alerts/publish", response_model=TeacherDashboardAlertPublishResponse)
def publish_teacher_dashboard_overview_alerts(
    principal: Principal = Depends(require_teacher),
) -> TeacherDashboardAlertPublishResponse:
    summary = publish_teacher_dashboard_alerts(teacher_id=principal.user_id, created_by_user_id=principal.user_id)
    return TeacherDashboardAlertPublishResponse(**summary)


@router.post("/classes/{class_id}/action-drafts", response_model=TeacherClassActionDraftResponse)
def create_teacher_class_action_draft(
    class_id: str,
    request: TeacherClassActionDraftRequest,
    principal: Principal = Depends(require_teacher),
) -> TeacherClassActionDraftResponse:
    assert_teacher_can_access_class(principal.user_id, class_id)
    if not repository.is_class_scheduled_on(class_id, request.scheduled_for):
        raise HTTPException(status_code=400, detail="scheduled_for must be a valid class date")
    draft = repository.create_teacher_class_action_draft(
        class_id=class_id,
        teacher_id=principal.user_id,
        action_type=request.action_type,
        content=request.content,
        scheduled_for=request.scheduled_for,
    )
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="create",
        resource_type="teacher_class_action_draft",
        resource_id=draft["id"],
        metadata={"class_id": class_id, "action_type": request.action_type, "scheduled_for": request.scheduled_for.isoformat()},
    )
    return TeacherClassActionDraftResponse(**draft)


@router.post("/classes/{class_id}/action-drafts/{draft_id}/send", response_model=TeacherClassActionSendResponse)
def send_teacher_class_action_draft(
    class_id: str,
    draft_id: str,
    principal: Principal = Depends(require_teacher),
) -> TeacherClassActionSendResponse:
    assert_teacher_can_access_class(principal.user_id, class_id)
    draft = repository.get_teacher_class_action_draft(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Action draft not found")
    if draft["class_id"] != class_id:
        raise HTTPException(status_code=400, detail="Action draft does not belong to this class")
    if draft["status"] == "sent":
        raise HTTPException(status_code=409, detail="Action draft has already been sent")
    summary = publish_teacher_class_message(
        class_id=class_id,
        draft_id=draft_id,
        content=draft["content"],
        created_by_user_id=principal.user_id,
    )
    repository.mark_teacher_class_action_draft_sent(draft_id, principal.user_id)
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="send",
        resource_type="teacher_class_action_draft",
        resource_id=draft_id,
        metadata={"class_id": class_id, **summary},
    )
    return TeacherClassActionSendResponse(draft_id=draft_id, class_id=class_id, status="sent", **summary)


@router.get("/classes/{class_id}/students", response_model=list[StudentSummary])
def class_students(class_id: str, principal: Principal = Depends(get_current_user)) -> list[StudentSummary]:
    if principal.role == Role.teacher:
        assert_teacher_can_access_class(principal.user_id, class_id)
    elif principal.role != Role.admin:
        raise HTTPException(status_code=403, detail="Admin or assigned teacher role required")
    return [
        StudentSummary(id=student.id, full_name=student.full_name, level=student.level)
        for student in repository.get_students_for_class(class_id)
    ]


@router.get("/classes/{class_id}/attendance-dates", response_model=list[date])
def class_attendance_dates(
    class_id: str,
    start: date | None = None,
    end: date | None = None,
    principal: Principal = Depends(require_teacher),
) -> list[date]:
    assert_teacher_can_access_class(principal.user_id, class_id)
    return repository.get_attendance_dates_for_class(class_id, start=start, end=end)


@router.get("/classes/{class_id}/attendance/{class_date}", response_model=AttendanceSessionResponse)
def class_attendance_session(
    class_id: str,
    class_date: date,
    principal: Principal = Depends(require_teacher),
) -> AttendanceSessionResponse:
    assert_teacher_can_access_class(principal.user_id, class_id)
    allowed_dates = repository.get_attendance_dates_for_class(class_id, start=class_date, end=class_date)
    if class_date not in allowed_dates:
        raise HTTPException(status_code=400, detail="This date is not in the class attendance schedule")
    return AttendanceSessionResponse(**repository.get_attendance_session_for_class(class_id, class_date))


@router.put("/classes/{class_id}/attendance/{class_date}", response_model=AttendanceSessionResponse)
def save_class_attendance(
    class_id: str,
    class_date: date,
    request: AttendanceSaveRequest,
    principal: Principal = Depends(require_teacher),
) -> AttendanceSessionResponse:
    assert_teacher_can_access_class(principal.user_id, class_id)
    if request.class_date != class_date:
        raise HTTPException(status_code=400, detail="Request class_date must match path class_date")
    allowed_dates = repository.get_attendance_dates_for_class(class_id, start=class_date, end=class_date)
    if class_date not in allowed_dates:
        raise HTTPException(status_code=400, detail="This date is not in the class attendance schedule")
    try:
        session = repository.upsert_attendance_for_class(
            class_id=class_id,
            class_date=class_date,
            records=[record.model_dump() for record in request.records],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="upsert",
        resource_type="attendance",
        resource_id=f"{class_id}:{class_date.isoformat()}",
        metadata={"class_id": class_id, "class_date": class_date.isoformat(), "records": len(request.records)},
    )
    return AttendanceSessionResponse(**session)


@router.post("/assessments", response_model=AssessmentResponse)
def create_assessment(
    request: AssessmentCreateRequest,
    principal: Principal = Depends(require_teacher),
) -> AssessmentResponse:
    assert_teacher_can_access_class(principal.user_id, request.class_id)
    assessment = repository.create_assessment(
        class_id=request.class_id,
        title=request.title,
        description=request.description,
        assessment_date=request.assessment_date,
        teacher_id=principal.user_id,
        duration_minutes=request.duration_minutes,
        lockdown_enabled=request.lockdown_enabled,
        max_violation_count=request.max_violation_count,
    )
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="create",
        resource_type="assessment",
        resource_id=assessment["id"],
        metadata={"class_id": request.class_id},
    )
    return AssessmentResponse(**assessment)


@router.get("/classes/{class_id}/assessments", response_model=list[AssessmentResponse])
def list_class_assessments(
    class_id: str,
    principal: Principal = Depends(require_teacher),
) -> list[AssessmentResponse]:
    assert_teacher_can_access_class(principal.user_id, class_id)
    return [AssessmentResponse(**assessment) for assessment in repository.get_assessments_for_class(class_id)]


@router.post("/classes/{class_id}/assessments/import-draft", response_model=AssessmentImportDraftResponse)
def create_assessment_import_draft(
    class_id: str,
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
    principal: Principal = Depends(require_teacher),
) -> AssessmentImportDraftResponse:
    assert_teacher_can_access_class(principal.user_id, class_id)
    uploads = _read_uploads(file=file, files=files, fallback_filename="assessment-upload")
    draft = assessment_draft_from_uploads(uploads=uploads)
    filename = _upload_batch_filename(uploads)
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="import_assessment_draft",
        resource_type="assessment",
        resource_id=class_id,
        metadata={"class_id": class_id, "filename": filename, "file_count": len(uploads), "questions": len(draft["questions"]), "extraction_method": draft.get("extraction_method")},
    )
    return AssessmentImportDraftResponse(class_id=class_id, filename=filename, **draft)


@router.post("/classes/{class_id}/assessments/import", response_model=AssessmentImportResponse)
def import_assessment_from_reviewed_draft(
    class_id: str,
    request: AssessmentImportRequest,
    principal: Principal = Depends(require_teacher),
) -> AssessmentImportResponse:
    assert_teacher_can_access_class(principal.user_id, class_id)
    assessment = repository.create_assessment(
        class_id=class_id,
        title=request.title,
        description=request.description,
        assessment_date=request.assessment_date,
        teacher_id=principal.user_id,
        duration_minutes=request.duration_minutes,
        lockdown_enabled=request.lockdown_enabled,
        max_violation_count=request.max_violation_count,
    )
    questions = []
    for item in sorted(request.questions, key=lambda question: question.position or 0):
        if item.question_type == "multiple_choice" and not item.choices:
            raise HTTPException(status_code=400, detail="Multiple-choice questions require choices")
        questions.append(
            repository.create_assessment_question(
                assessment_id=assessment["id"],
                question_text=item.question_text,
                question_type=item.question_type,
                choices=item.choices,
                expected_answer=item.expected_answer,
                skill_tag=item.skill_tag,
                max_score=item.max_score,
                rubric_criteria=item.rubric_criteria,
                score_range=item.score_range,
            )
        )
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="import_assessment",
        resource_type="assessment",
        resource_id=assessment["id"],
        metadata={"class_id": class_id, "questions": len(questions)},
    )
    return AssessmentImportResponse(
        assessment=AssessmentResponse(**assessment),
        questions=[AssessmentQuestionResponse(**question) for question in questions],
    )


@router.get("/assessments/{assessment_id}", response_model=AssessmentResponse)
def get_assessment_detail(
    assessment_id: str,
    principal: Principal = Depends(require_teacher),
) -> AssessmentResponse:
    assessment = repository.get_assessment(assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assert_teacher_can_access_class(principal.user_id, assessment["class_id"])
    return AssessmentResponse(**assessment)


@router.get("/assessments/{assessment_id}/print-view", response_model=AssessmentPrintViewResponse)
def get_assessment_print_view(
    assessment_id: str,
    principal: Principal = Depends(get_current_user),
) -> AssessmentPrintViewResponse:
    assessment = repository.get_assessment(assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if principal.role == Role.teacher:
        assert_teacher_can_access_class(principal.user_id, assessment["class_id"])
    elif principal.role == Role.student:
        student = _current_student_for_principal(principal)
        if assessment["class_id"] not in student.class_ids:
            raise HTTPException(status_code=403, detail="Student is not enrolled in this assessment class")
    else:
        raise HTTPException(status_code=403, detail="Teacher or student role required")
    return AssessmentPrintViewResponse(
        assessment=_public_assessment_response(assessment),
        questions=[PublicAssessmentQuestionResponse(**question) for question in repository.get_public_questions_for_assessment(assessment_id)],
    )


@router.delete("/assessments/{assessment_id}")
def delete_assessment(
    assessment_id: str,
    principal: Principal = Depends(require_teacher),
) -> dict:
    assessment = repository.get_assessment(assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assert_teacher_can_access_class(principal.user_id, assessment["class_id"])
    if not repository.delete_assessment(assessment_id):
        raise HTTPException(status_code=404, detail="Assessment not found")
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="delete",
        resource_type="assessment",
        resource_id=assessment_id,
        metadata={"class_id": assessment["class_id"]},
    )
    return {"status": "deleted", "assessment_id": assessment_id}


@router.get("/assessments/{assessment_id}/questions", response_model=list[AssessmentQuestionResponse])
def list_assessment_questions(
    assessment_id: str,
    principal: Principal = Depends(require_teacher),
) -> list[AssessmentQuestionResponse]:
    assessment = repository.get_assessment(assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assert_teacher_can_access_class(principal.user_id, assessment["class_id"])
    return [AssessmentQuestionResponse(**question) for question in repository.get_questions_for_assessment(assessment_id)]


@router.delete("/assessments/{assessment_id}/questions")
def delete_all_assessment_questions(
    assessment_id: str,
    principal: Principal = Depends(require_teacher),
) -> dict:
    assessment = repository.get_assessment(assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assert_teacher_can_access_class(principal.user_id, assessment["class_id"])
    deleted_count = repository.delete_questions_for_assessment(assessment_id)
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="delete_all_questions",
        resource_type="assessment",
        resource_id=assessment_id,
        metadata={"class_id": assessment["class_id"], "questions_deleted": deleted_count},
    )
    return {"status": "deleted", "assessment_id": assessment_id, "questions_deleted": deleted_count}


@router.post("/assessments/{assessment_id}/questions/import-draft", response_model=AssessmentImportDraftResponse)
def create_assessment_question_import_draft(
    assessment_id: str,
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
    principal: Principal = Depends(require_teacher),
) -> AssessmentImportDraftResponse:
    assessment = repository.get_assessment(assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assert_teacher_can_access_class(principal.user_id, assessment["class_id"])
    uploads = _read_uploads(file=file, files=files, fallback_filename="assessment-upload")
    draft = assessment_draft_from_uploads(uploads=uploads)
    filename = _upload_batch_filename(uploads)
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="import_assessment_question_draft",
        resource_type="assessment",
        resource_id=assessment_id,
        metadata={"class_id": assessment["class_id"], "filename": filename, "file_count": len(uploads), "questions": len(draft["questions"]), "extraction_method": draft.get("extraction_method")},
    )
    return AssessmentImportDraftResponse(class_id=assessment["class_id"], filename=filename, **draft)


@router.post("/assessments/{assessment_id}/questions", response_model=AssessmentQuestionResponse)
def create_assessment_question(
    assessment_id: str,
    request: AssessmentQuestionCreateRequest,
    principal: Principal = Depends(require_teacher),
) -> AssessmentQuestionResponse:
    assessment = repository.get_assessment(assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assert_teacher_can_access_class(principal.user_id, assessment["class_id"])
    if request.question_type == "multiple_choice" and not request.choices:
        raise HTTPException(status_code=400, detail="Multiple-choice questions require choices")
    question = repository.create_assessment_question(
        assessment_id=assessment_id,
        question_text=request.question_text,
        question_type=request.question_type,
        choices=request.choices,
        expected_answer=request.expected_answer,
        skill_tag=request.skill_tag,
        max_score=request.max_score,
        rubric_criteria=request.rubric_criteria,
        score_range=request.score_range,
    )
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="create",
        resource_type="assessment_question",
        resource_id=question["id"],
        metadata={"assessment_id": assessment_id, "skill": question["skill_tag"]},
    )
    return AssessmentQuestionResponse(**question)


@router.delete("/questions/{question_id}")
def delete_assessment_question(
    question_id: str,
    principal: Principal = Depends(require_teacher),
) -> dict:
    question = repository.get_assessment_question(question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    assessment = repository.get_assessment(question["assessment_id"])
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assert_teacher_can_access_class(principal.user_id, assessment["class_id"])
    if not repository.delete_assessment_question(question_id):
        raise HTTPException(status_code=404, detail="Question not found")
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="delete",
        resource_type="assessment_question",
        resource_id=question_id,
        metadata={"assessment_id": question["assessment_id"]},
    )
    return {"status": "deleted", "question_id": question_id}


@router.patch("/questions/{question_id}", response_model=AssessmentQuestionResponse)
def update_assessment_question(
    question_id: str,
    request: AssessmentQuestionUpdateRequest,
    principal: Principal = Depends(require_teacher),
) -> AssessmentQuestionResponse:
    question = repository.get_assessment_question(question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    assessment = repository.get_assessment(question["assessment_id"])
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assert_teacher_can_access_class(principal.user_id, assessment["class_id"])
    if request.question_type == "multiple_choice" and not request.choices:
        raise HTTPException(status_code=400, detail="Multiple-choice questions require choices")
    updated = repository.update_assessment_question(
        question_id=question_id,
        question_text=request.question_text,
        question_type=request.question_type,
        choices=request.choices,
        expected_answer=request.expected_answer,
        skill_tag=request.skill_tag,
        max_score=request.max_score,
        rubric_criteria=request.rubric_criteria,
        score_range=request.score_range,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Question not found")
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="update",
        resource_type="assessment_question",
        resource_id=question_id,
        metadata={"assessment_id": question["assessment_id"], "skill": updated["skill_tag"].value},
    )
    return AssessmentQuestionResponse(**updated)


@router.post("/questions/{question_id}/student-answers", response_model=StudentAnswerResponse)
def create_student_answer(
    question_id: str,
    request: StudentAnswerCreateRequest,
    principal: Principal = Depends(require_teacher),
) -> StudentAnswerResponse:
    question = repository.get_assessment_question(question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    assessment = repository.get_assessment(question["assessment_id"])
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    student = repository.get_student(request.student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    assert_teacher_can_access_class(principal.user_id, assessment["class_id"])
    if assessment["class_id"] not in student.class_ids:
        raise HTTPException(status_code=403, detail="Student is not enrolled in this assessment class")
    if request.score_awarded is not None and request.score_awarded > question["max_score"]:
        raise HTTPException(status_code=400, detail="Score exceeds question max_score")
    auto_score = auto_score_answer(question, request.answer_text)
    score_awarded = request.score_awarded if request.score_awarded is not None else auto_score
    answer = repository.create_student_answer(
        student_id=student.id,
        question_id=question_id,
        answer_text=request.answer_text,
        submitted_at=request.submitted_at,
        score_awarded=score_awarded,
        teacher_feedback=request.teacher_feedback,
    )
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="create",
        resource_type="student_answer",
        resource_id=answer["id"],
        metadata={"student_id": student.id, "question_id": question_id},
    )
    return _student_answer_response(answer)


@router.post("/assessments/{assessment_id}/student-submissions", response_model=StudentAssessmentSubmissionResponse)
def submit_student_assessment(
    assessment_id: str,
    request: StudentAssessmentSubmissionRequest,
    principal: Principal = Depends(require_teacher),
) -> StudentAssessmentSubmissionResponse:
    assessment = repository.get_assessment(assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assert_teacher_can_access_class(principal.user_id, assessment["class_id"])

    student = repository.get_student(request.student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if assessment["class_id"] not in student.class_ids:
        raise HTTPException(status_code=403, detail="Student is not enrolled in this assessment class")
    return _save_assessment_submission(
        assessment_id=assessment_id,
        assessment=assessment,
        request=request,
        principal=principal,
        audit_action="submit",
        generate_ai_insight=True,
        prefer_submitted_scores=True,
        sync_skill_scores=True,
    )


@router.post("/assessments/{assessment_id}/ocr-drafts", response_model=OcrDraftResponse)
def create_assessment_ocr_draft(
    assessment_id: str,
    student_id: str = Form(...),
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
    principal: Principal = Depends(require_teacher),
) -> OcrDraftResponse:
    assessment = repository.get_assessment(assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assert_teacher_can_access_class(principal.user_id, assessment["class_id"])
    student = repository.get_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if assessment["class_id"] not in student.class_ids:
        raise HTTPException(status_code=403, detail="Student is not enrolled in this assessment class")

    questions = repository.get_public_questions_for_assessment(assessment_id)
    uploads = _read_uploads(file=file, files=files, fallback_filename="answer-upload")
    draft = answer_draft_from_uploads(uploads=uploads, questions=questions)
    filename = _upload_batch_filename(uploads)
    warning = draft["warnings"][0] if draft["warnings"] else None
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="ocr_answer_draft",
        resource_type="assessment",
        resource_id=assessment_id,
        metadata={"student_id": student.id, "filename": filename, "file_count": len(uploads), "extraction_method": draft.get("extraction_method")},
    )
    return OcrDraftResponse(
        assessment_id=assessment_id,
        student_id=student.id,
        filename=filename,
        extraction_method=draft.get("extraction_method"),
        extracted_text=draft["extracted_text"],
        answers=[OcrDraftAnswer(**answer) for answer in draft["answers"]],
        warning=warning,
        warnings=draft["warnings"],
    )


@router.get("/students/{student_id}/answers", response_model=list[StudentAnswerResponse])
def get_student_answers(
    student_id: str,
    principal: Principal = Depends(get_current_user),
) -> list[StudentAnswerResponse]:
    student = repository.get_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    assert_student_access(principal, student.id, student.class_ids)
    return [_student_answer_response(answer) for answer in repository.get_answers_for_student(student.id)]


@router.get("/students/{student_id}/assessment-summary", response_model=StudentAssessmentSummaryResponse)
def get_student_assessment_summary(
    student_id: str,
    assessment_id: str | None = None,
    principal: Principal = Depends(get_current_user),
) -> StudentAssessmentSummaryResponse:
    student = repository.get_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    assert_student_access(principal, student.id, student.class_ids)
    if assessment_id:
        assessment = repository.get_assessment(assessment_id)
        if assessment is None:
            raise HTTPException(status_code=404, detail="Assessment not found")
        if assessment["class_id"] not in student.class_ids:
            raise HTTPException(status_code=403, detail="Student is not enrolled in this assessment class")
    summary = repository.get_assessment_summary_for_student(student.id, assessment_id)
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="read",
        resource_type="assessment_summary",
        resource_id=assessment_id or student.id,
        metadata={"student_id": student.id},
    )
    return StudentAssessmentSummaryResponse(**summary)


@router.get("/students/{student_id}/ai-insights", response_model=list[AiInsightResponse])
def get_student_ai_insights(
    student_id: str,
    type: str | None = None,
    principal: Principal = Depends(get_current_user),
) -> list[AiInsightResponse]:
    student = repository.get_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    assert_student_access(principal, student.id, student.class_ids)
    insights = repository.get_ai_insights_for_student(student.id, type or ASSESSMENT_PROGRESS_INSIGHT)
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="read",
        resource_type="ai_insight",
        resource_id=type or ASSESSMENT_PROGRESS_INSIGHT,
        metadata={"student_id": student.id},
    )
    return [AiInsightResponse(**insight.model_dump()) for insight in insights]


@router.post("/students/{student_id}/ai-insights/approve", response_model=AiInsightResponse)
def approve_student_ai_insight(
    student_id: str,
    request: AiInsightApprovalRequest,
    principal: Principal = Depends(get_current_user),
) -> AiInsightResponse:
    student = repository.get_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if principal.role == Role.teacher:
        _assert_teacher_can_manage_student(principal, student.class_ids)
    elif principal.role != Role.admin:
        raise HTTPException(status_code=403, detail="Teacher or admin role required")
    assessment_id = request.assessment_id or _assessment_id_from_insight_context(request.retrieved_context)
    insight = approve_assessment_progress_insight(
        principal=principal,
        student_id=student.id,
        assessment_id=assessment_id,
        content=request.content,
        retrieved_context=request.retrieved_context,
        safety_notes=request.safety_notes,
    )
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="approve",
        resource_type="ai_insight",
        resource_id=insight.id,
        metadata={"student_id": student.id, "assessment_id": assessment_id, "insight_type": insight.insight_type},
    )
    return AiInsightResponse(**insight.model_dump())


@router.get("/students/{student_id}/scores", response_model=list[ScoreResponse])
def get_student_scores(
    student_id: str,
    principal: Principal = Depends(require_teacher),
) -> list[ScoreResponse]:
    student = repository.get_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    _assert_teacher_can_manage_student(principal, student.class_ids)
    return [ScoreResponse(**score.model_dump()) for score in repository.get_scores_for_student(student.id)]


@router.post("/students/{student_id}/scores", response_model=ScoreResponse)
def create_student_score(
    student_id: str,
    request: ScoreCreateRequest,
    principal: Principal = Depends(require_teacher),
) -> ScoreResponse:
    student = repository.get_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    class_id = request.class_id or _first_manageable_class_id(principal, student.class_ids)
    assert_teacher_can_access_class(principal.user_id, class_id)
    if class_id not in student.class_ids:
        raise HTTPException(status_code=403, detail="Student is not enrolled in this class")

    score = repository.create_score(
        student_id=student.id,
        class_id=class_id,
        skill=request.skill,
        score=request.score,
        teacher_id=principal.user_id,
        assessed_on=request.assessed_on or date.today(),
        teacher_comment=request.teacher_comment,
    )
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="create",
        resource_type="skill_score",
        resource_id=score.id,
        metadata={"student_id": student.id, "skill": score.skill},
    )
    return ScoreResponse(**score.model_dump())


@router.put("/scores/{score_id}", response_model=ScoreResponse)
def update_score(
    score_id: str,
    request: ScoreUpdateRequest,
    principal: Principal = Depends(require_teacher),
) -> ScoreResponse:
    existing = repository.get_score(score_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Score not found")
    student = repository.get_student(existing.student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    _assert_teacher_can_manage_student(principal, student.class_ids)

    score = repository.update_score(
        score_id=score_id,
        score=request.score,
        assessed_on=request.assessed_on,
        teacher_comment=request.teacher_comment,
    )
    if score is None:
        raise HTTPException(status_code=404, detail="Score not found")
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="update",
        resource_type="skill_score",
        resource_id=score.id,
        metadata={"student_id": score.student_id, "skill": score.skill},
    )
    return ScoreResponse(**score.model_dump())


@router.post("/ai/chat", response_model=ChatResponse)
def chat(request: ChatRequest, principal: Principal = Depends(get_current_user)) -> ChatResponse:
    return _generate_chat_response(request, principal)


@router.get("/parent/notifications", response_model=list[ParentNotificationResponse])
def list_parent_notifications(
    limit: int = 50,
    principal: Principal = Depends(require_parent),
) -> list[ParentNotificationResponse]:
    limit = max(1, min(limit, 100))
    return [ParentNotificationResponse(**item.model_dump()) for item in repository.list_parent_notifications(principal.user_id, limit=limit)]


@router.post("/parent/notifications/{notification_id}/read", response_model=ParentNotificationResponse)
def mark_parent_notification_read(
    notification_id: str,
    principal: Principal = Depends(require_parent),
) -> ParentNotificationResponse:
    notification = repository.mark_parent_notification_read(notification_id, principal.user_id)
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    return ParentNotificationResponse(**notification.model_dump())


def _generate_chat_response(
    request: ChatRequest,
    principal: Principal,
    *,
    clarification_as_answer: bool = False,
    audit_actor_id: str | None = None,
    audit_actor_role: Role | None = None,
    session_user_id: str | None = None,
    audit_metadata: dict | None = None,
    channel: str | None = None,
) -> ChatResponse:
    input_decision = check_input(request.message, request.locale)
    if not input_decision.allowed:
        return ChatResponse(
            intent=Intent.general_parent_support,
            intents=[Intent.general_parent_support],
            answer=str(input_decision.value),
            retrieved_context=[],
            safety_notes=input_decision.safety_notes,
        )
    routing = route_intents(request.message, request.locale)
    if routing.needs_clarification:
        if clarification_as_answer:
            return ChatResponse(
                intent=routing.primary_intent,
                intents=routing.intents,
                answer=routing.clarification_question or "Bạn có thể nói rõ hơn nội dung muốn hỏi không?",
                retrieved_context=[],
                safety_notes=["clarification_requested"],
            )
        raise HTTPException(status_code=400, detail=routing.clarification_question)
    repository.create_audit_log(
        actor_id=audit_actor_id or principal.user_id,
        actor_role=audit_actor_role or principal.role,
        action="route",
        resource_type="ai_chat_intent",
        resource_id=session_user_id or principal.user_id,
        metadata={
            "intent": routing.primary_intent.value,
            "intents": [intent.value for intent in routing.intents],
            "confidence": routing.confidence,
            "used_fallback": routing.used_fallback,
            "user_role": principal.role.value,
            "target_student_id": request.student_id,
            "chat_actor_id": principal.user_id,
            **(audit_metadata or {}),
        },
    )
    context_bundle = retrieve_authorized_context(routing.intents, principal, request.message, request.student_id)
    retrieval_decision = check_retrieval(context_bundle.evidence)
    if not retrieval_decision.allowed:
        output_decision = check_output("", request.locale)
        return ChatResponse(
            intent=routing.primary_intent,
            intents=routing.intents,
            answer=str(output_decision.value),
            retrieved_context=[],
            safety_notes=[*retrieval_decision.safety_notes, *output_decision.safety_notes],
        )
    context = list(retrieval_decision.value)
    key = session_key(user_id=session_user_id or principal.user_id, student_id=request.student_id)
    session_context = recent_turns_context(get_recent_turns(key, limit=2))
    session_decision = check_retrieval(session_context)
    safe_session_context = list(session_decision.value) if session_decision.allowed else []
    raw_answer = get_ai_provider().generate_parent_answer(
        request.message,
        context,
        request.locale,
        channel=channel,
        intents=[intent.value for intent in routing.intents],
        conversation_history=safe_session_context,
    )
    output_decision = check_output(raw_answer, request.locale)
    answer = str(output_decision.value)
    add_turn(key, question=request.message, answer=answer)
    return ChatResponse(
        intent=routing.primary_intent,
        intents=routing.intents,
        answer=answer,
        sources=context_bundle.sources,
        retrieved_context=context if get_settings().expose_ai_evidence else [],
        safety_notes=[*retrieval_decision.safety_notes, *session_decision.safety_notes, *output_decision.safety_notes],
    )


@router.delete("/ai/chat/session")
def clear_chat_session(principal: Principal = Depends(get_current_user)) -> dict[str, str]:
    clear_user_sessions(principal.user_id)
    return {"status": "deleted"}


@router.post("/documents", response_model=DocumentResponse)
def create_document(
    request: DocumentCreateRequest,
    principal: Principal = Depends(require_admin),
) -> DocumentResponse:
    document = create_rag_document(
        title=request.title,
        document_type=request.document_type,
        content=request.content,
        locale=request.locale,
        source_uri=request.source_uri,
    )
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="create",
        resource_type="document",
        resource_id=document["id"],
        metadata={"document_type": document["document_type"]},
    )
    return DocumentResponse(**document)


@router.post("/documents/ingest-folder", response_model=RagFolderIngestResponse)
def ingest_rag_documents_folder(
    principal: Principal = Depends(require_admin),
) -> RagFolderIngestResponse:
    summary = ingest_documents_from_folder()
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="ingest_folder",
        resource_type="document",
        resource_id="rag_documents",
        metadata={
            "documents_dir": summary["documents_dir"],
            "documents_processed": summary["documents_processed"],
            "chunks_created": summary["chunks_created"],
        },
    )
    return RagFolderIngestResponse(**summary)


@router.post("/documents/{document_id}/ingest", response_model=DocumentIngestResponse)
def ingest_rag_document(
    document_id: str,
    principal: Principal = Depends(require_admin),
) -> DocumentIngestResponse:
    chunks_created = ingest_document(document_id)
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="ingest",
        resource_type="document",
        resource_id=document_id,
        metadata={"chunks_created": chunks_created},
    )
    return DocumentIngestResponse(document_id=document_id, chunks_created=chunks_created)


@router.post("/rag/search", response_model=RagSearchResponse)
def rag_search(
    request: RagSearchRequest,
    principal: Principal = Depends(get_current_user),
) -> RagSearchResponse:
    results = search_rag(request.query, limit=request.limit)
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="search",
        resource_type="rag",
        resource_id="document_chunks",
        metadata={"result_count": len(results)},
    )
    if not results:
        return RagSearchResponse(answer="information unavailable", chunks=[])
    return RagSearchResponse(
        answer="ok",
        chunks=[
            RagSearchChunk(
                document_id=result.id,
                document_title=result.title,
                document_type=result.source_type,
                chunk_id=result.metadata["chunk_id"],
                chunk_index=result.metadata["chunk_index"],
                content=result.content,
                score=result.score or 0,
                metadata=result.metadata,
            )
            for result in results
        ],
    )


@router.get("/admin/users", response_model=list[UserSummary])
def list_users(principal: Principal = Depends(require_admin)) -> list[UserSummary]:
    assert_admin_access(principal.user_id)
    return [_user_summary(user) for user in repository.list_users()]


@router.delete("/admin/users/{user_id}")
def delete_user(user_id: str, principal: Principal = Depends(require_admin)) -> dict:
    assert_admin_access(principal.user_id)
    if user_id == principal.user_id:
        raise HTTPException(status_code=400, detail="Admin cannot delete their own active session user")
    user = repository.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not repository.delete_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="delete",
        resource_type="user",
        resource_id=user_id,
        metadata={"deleted_role": user.role.value, "email": user.email},
    )
    return {"status": "deleted", "user_id": user_id}


@router.get("/admin/teachers")
def list_teachers(principal: Principal = Depends(require_admin)) -> list[dict]:
    assert_admin_access(principal.user_id)
    return repository.list_teachers()


@router.get("/admin/parents")
def list_parents(principal: Principal = Depends(require_admin)) -> list[dict]:
    assert_admin_access(principal.user_id)
    return [parent.model_dump() for parent in repository.list_parents()]


@router.get("/admin/students", response_model=list[StudentSummary])
def list_students(principal: Principal = Depends(require_admin)) -> list[StudentSummary]:
    assert_admin_access(principal.user_id)
    return [StudentSummary(id=student.id, full_name=student.full_name, level=student.level) for student in repository.list_students()]


@router.delete("/admin/students/{student_id}")
def delete_student(student_id: str, principal: Principal = Depends(require_admin)) -> dict:
    assert_admin_access(principal.user_id)
    student = repository.get_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if not repository.delete_student(student_id):
        raise HTTPException(status_code=404, detail="Student not found")
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="delete",
        resource_type="student",
        resource_id=student_id,
        metadata={"full_name": student.full_name},
    )
    return {"status": "deleted", "student_id": student_id}


@router.get("/admin/classes", response_model=list[ClassSummary])
def list_classes(principal: Principal = Depends(require_admin)) -> list[ClassSummary]:
    assert_admin_access(principal.user_id)
    classes = repository.list_classes()
    teacher_names = repository.get_teacher_names_by_class_ids([item.id for item in classes])
    return [
        ClassSummary(
            id=class_record.id,
            course_id=class_record.course_id,
            name=class_record.name,
            location=class_record.location,
            schedule_note=class_record.schedule_note,
            start_time=class_record.start_time,
            end_time=class_record.end_time,
            teacher_names=teacher_names.get(class_record.id, []),
        )
        for class_record in classes
    ]


@router.get("/admin/courses", response_model=list[CourseSummary])
def list_courses(principal: Principal = Depends(require_admin)) -> list[CourseSummary]:
    assert_admin_access(principal.user_id)
    return [CourseSummary(**course.model_dump()) for course in repository.list_courses()]


@router.post("/admin/classes", response_model=ClassSummary)
def create_class(
    request: AdminCreateClassRequest,
    principal: Principal = Depends(require_admin),
) -> ClassSummary:
    assert_admin_access(principal.user_id)
    class_record = repository.create_class(
        course_id=request.course_id,
        location=request.location,
        starts_on=request.starts_on,
        ends_on=request.ends_on,
        schedule_note=request.schedule_note,
        start_time=request.start_time,
        end_time=request.end_time,
    )
    if class_record is None:
        raise HTTPException(status_code=404, detail="Course not found")
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="create",
        resource_type="class",
        resource_id=class_record.id,
        metadata={"course_id": class_record.course_id},
    )
    return ClassSummary(
        id=class_record.id,
        course_id=class_record.course_id,
        name=class_record.name,
        location=class_record.location,
        schedule_note=class_record.schedule_note,
        start_time=class_record.start_time,
        end_time=class_record.end_time,
    )


@router.delete("/admin/classes/{class_id}")
def delete_class(class_id: str, principal: Principal = Depends(require_admin)) -> dict[str, str]:
    assert_admin_access(principal.user_id)
    class_record = repository.delete_class(class_id)
    if class_record is None:
        raise HTTPException(status_code=404, detail="Class not found")
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="delete",
        resource_type="class",
        resource_id=class_id,
        metadata={"name": class_record.name, "course_id": class_record.course_id},
    )
    return {"status": "deleted", "class_id": class_id}


@router.post("/admin/teachers", response_model=AdminCreateTeacherResponse)
def create_teacher(
    request: AdminCreateUserRequest,
    principal: Principal = Depends(require_admin),
) -> AdminCreateTeacherResponse:
    assert_admin_access(principal.user_id)
    try:
        user = repository.create_local_user(
            email=request.email,
            full_name=request.full_name,
            role=Role.teacher,
            password=request.password,
        )
        teacher = repository.create_teacher_profile(user=user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="create",
        resource_type="teacher",
        resource_id=user.id,
        metadata={"email": user.email},
    )
    return AdminCreateTeacherResponse(user=_user_summary(user), teacher=teacher)


@router.post("/admin/parents", response_model=AdminCreateParentResponse)
def create_parent(
    request: AdminCreateParentRequest,
    principal: Principal = Depends(require_admin),
) -> AdminCreateParentResponse:
    assert_admin_access(principal.user_id)
    try:
        user = repository.create_local_user(
            email=request.email,
            full_name=request.full_name,
            role=Role.parent,
            password=request.password,
        )
        parent = repository.create_parent_profile(user=user, preferred_language=request.preferred_language)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="create",
        resource_type="parent",
        resource_id=user.id,
        metadata={"email": user.email},
    )
    return AdminCreateParentResponse(user=_user_summary(user), parent=parent.model_dump())


@router.post("/admin/students", response_model=StudentSummary)
def create_student(
    request: AdminCreateStudentRequest,
    principal: Principal = Depends(require_admin),
) -> StudentSummary:
    assert_admin_access(principal.user_id)
    try:
        student_user = None
        if request.student_email:
            student_user = repository.create_local_user(
                email=request.student_email,
                full_name=request.full_name,
                role=Role.student,
                password=request.student_password or "Password123!",
            )
        student = repository.create_student_with_parent_link(
            full_name=request.full_name,
            level=request.level,
            parent_user_id=request.parent_user_id,
            class_id=request.class_id,
            student_user_id=student_user.id if student_user else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action="create",
        resource_type="student",
        resource_id=student.id,
        metadata={"class_id": request.class_id, "parent_user_id": request.parent_user_id, "student_email": request.student_email},
    )
    return StudentSummary(id=student.id, full_name=student.full_name, level=student.level)


@router.post("/admin/parent-student-links")
def link_parent_to_student(
    request: AdminLinkParentStudentRequest,
    principal: Principal = Depends(require_admin),
) -> dict:
    assert_admin_access(principal.user_id)
    try:
        repository.link_parent_to_student(parent_user_id=request.parent_user_id, student_id=request.student_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "linked", "parent_user_id": request.parent_user_id, "student_id": request.student_id}


@router.post("/admin/teacher-class-links")
def assign_teacher_to_class(
    request: AdminAssignTeacherClassRequest,
    principal: Principal = Depends(require_admin),
) -> dict:
    assert_admin_access(principal.user_id)
    try:
        repository.assign_teacher_to_class(teacher_user_id=request.teacher_user_id, class_id=request.class_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "assigned", "teacher_user_id": request.teacher_user_id, "class_id": request.class_id}


@router.get("/admin/zalo-bot/status")
def get_zalo_bot_status(principal: Principal = Depends(require_admin)) -> dict:
    assert_admin_access(principal.user_id)
    settings = get_settings()
    headers = {"Content-Type": "application/json"}
    if settings.integration_shared_secret:
        headers["Authorization"] = f"Bearer {settings.integration_shared_secret}"
    try:
        with httpx.Client(timeout=5) as client:
            response = client.get(
                f"{settings.zalo_service_url.rstrip('/')}/internal/bot/status",
                headers=headers,
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError:
        return {"status": "unavailable", "error": "Zalo bot service is not reachable"}


@router.post("/admin/zalo-bot/login-qr")
def trigger_zalo_bot_login_qr(principal: Principal = Depends(require_admin)) -> dict:
    assert_admin_access(principal.user_id)
    settings = get_settings()
    headers = {"Content-Type": "application/json"}
    if settings.integration_shared_secret:
        headers["Authorization"] = f"Bearer {settings.integration_shared_secret}"
    try:
        with httpx.Client(timeout=30) as client:
            response = client.post(
                f"{settings.zalo_service_url.rstrip('/')}/internal/bot/login-qr",
                headers=headers,
                json={},
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Zalo bot service is not reachable") from exc


@router.post("/admin/zalo-bot/logout")
def logout_zalo_bot(principal: Principal = Depends(require_admin)) -> dict:
    assert_admin_access(principal.user_id)
    settings = get_settings()
    headers = {"Content-Type": "application/json"}
    if settings.integration_shared_secret:
        headers["Authorization"] = f"Bearer {settings.integration_shared_secret}"
    try:
        with httpx.Client(timeout=15) as client:
            response = client.post(
                f"{settings.zalo_service_url.rstrip('/')}/internal/bot/logout",
                headers=headers,
                json={},
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Zalo bot service is not reachable") from exc


def _first_manageable_class_id(principal: Principal, class_ids: list[str]) -> str:
    for class_id in class_ids:
        if class_id in principal.assigned_class_ids:
            return class_id
    raise HTTPException(status_code=403, detail="Teacher cannot manage this student")


def _assert_teacher_can_manage_student(principal: Principal, class_ids: list[str]) -> None:
    _first_manageable_class_id(principal, class_ids)


def _current_student_for_principal(principal: Principal):
    students = repository.get_students_for_student_user(principal.user_id)
    if not students:
        raise HTTPException(status_code=403, detail="Student account is not linked to a student profile")
    return students[0]


def _refresh_attempt_if_expired(attempt: dict | None) -> dict | None:
    if attempt is None or attempt["status"] != "in_progress" or attempt["expires_at"] is None:
        return attempt
    expires_at = attempt["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at >= datetime.now(UTC):
        return attempt
    repository.create_assessment_attempt_event(
        attempt_id=attempt["id"],
        event_type="expired",
        occurred_at=datetime.now(UTC),
        metadata={},
    )
    return repository.update_assessment_attempt(attempt["id"], status="expired") or attempt


def _validate_student_attempt_for_submission(
    *,
    student_id: str,
    assessment_id: str,
    attempt_id: str | None,
    allow_expired: bool,
) -> dict | None:
    assessment = repository.get_assessment(assessment_id)
    requires_attempt = bool(assessment and (assessment["duration_minutes"] or assessment["lockdown_enabled"]))
    attempt = _refresh_attempt_if_expired(repository.get_assessment_attempt(student_id=student_id, assessment_id=assessment_id))
    if not requires_attempt and attempt_id is None and attempt is None:
        return None
    if requires_attempt and attempt_id is None:
        raise HTTPException(status_code=409, detail="Assessment attempt is required")
    if attempt is None:
        raise HTTPException(status_code=409, detail="Assessment attempt has not started")
    if attempt_id is not None and attempt["id"] != attempt_id:
        raise HTTPException(status_code=403, detail="Attempt does not belong to this student assessment")
    allowed_statuses = {"in_progress", "locked"}
    if allow_expired:
        allowed_statuses.add("expired")
    if attempt["status"] not in allowed_statuses:
        raise HTTPException(status_code=409, detail=f"Assessment attempt is {attempt['status']}")
    return attempt


def _get_assessment_for_student(assessment_id: str, student_id: str) -> dict:
    assessment = repository.get_assessment(assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    student = repository.get_student(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if assessment["class_id"] not in student.class_ids:
        raise HTTPException(status_code=403, detail="Student is not enrolled in this assessment class")
    return assessment


def _assessment_id_from_insight_context(retrieved_context: list[dict]) -> str | None:
    if not retrieved_context:
        return None
    assessment_id = retrieved_context[0].get("assessment_id")
    return assessment_id if isinstance(assessment_id, str) and assessment_id else None


def _save_assessment_submission(
    *,
    assessment_id: str,
    assessment: dict,
    request: StudentAssessmentSubmissionRequest,
    principal: Principal,
    audit_action: str,
    generate_ai_insight: bool = False,
    prefer_submitted_scores: bool = False,
    sync_skill_scores: bool = False,
    attempt_id: str | None = None,
) -> StudentAssessmentSubmissionResponse:
    student = repository.get_student(request.student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if assessment["class_id"] not in student.class_ids:
        raise HTTPException(status_code=403, detail="Student is not enrolled in this assessment class")

    questions = {question["id"]: question for question in repository.get_questions_for_assessment(assessment_id)}
    max_score = 0.0
    total_score = 0.0
    has_score = False
    for answer in request.answers:
        question = questions.get(answer.question_id)
        if question is None:
            raise HTTPException(status_code=400, detail=f"Question {answer.question_id} does not belong to this assessment")
        if answer.score_awarded is not None and answer.score_awarded > question["max_score"]:
            raise HTTPException(status_code=400, detail=f"Score for question {answer.question_id} exceeds max_score")
        auto_score = auto_score_answer(question, answer.answer_text)
        if prefer_submitted_scores and answer.score_awarded is not None:
            score_awarded = answer.score_awarded
        else:
            score_awarded = auto_score if auto_score is not None else answer.score_awarded
        max_score += question["max_score"]
        if score_awarded is not None:
            total_score += score_awarded
            has_score = True
        repository.upsert_student_answer(
            student_id=student.id,
            question_id=answer.question_id,
            answer_text=answer.answer_text,
            submitted_at=request.submitted_at,
            score_awarded=score_awarded,
            teacher_feedback=answer.teacher_feedback,
        )

    repository.create_audit_log(
        actor_id=principal.user_id,
        actor_role=principal.role,
        action=audit_action,
        resource_type="student_assessment",
        resource_id=assessment_id,
        metadata={"student_id": student.id, "answers_saved": len(request.answers)},
    )
    if attempt_id is not None:
        submitted_at = request.submitted_at or datetime.now(UTC)
        repository.update_assessment_attempt(attempt_id, status="submitted", submitted_at=submitted_at)
        repository.create_assessment_attempt_event(
            attempt_id=attempt_id,
            event_type="submitted",
            occurred_at=submitted_at,
            metadata={"answers_saved": len(request.answers)},
        )
    alert_status = None
    if has_score and sync_skill_scores:
        synced_scores = repository.sync_skill_scores_from_assessment(
            student_id=student.id,
            assessment_id=assessment_id,
            teacher_id=principal.user_id if principal.role == Role.teacher else assessment.get("created_by_teacher_id"),
        )
        if synced_scores:
            repository.create_audit_log(
                actor_id=principal.user_id,
                actor_role=principal.role,
                action="sync_from_assessment",
                resource_type="skill_score",
                resource_id=assessment_id,
                metadata={"student_id": student.id, "skills": [score.skill.value for score in synced_scores]},
            )
        alert_status = publish_student_class_alerts(
            student_id=student.id,
            class_id=assessment["class_id"],
            assessment_id=assessment_id,
            created_by_user_id=principal.user_id,
        )
    insight_status = None
    insight_payload = None
    insight_draft = None
    if generate_ai_insight and has_score:
        result = generate_assessment_progress_insight(
            principal=principal,
            student_id=student.id,
            assessment_id=assessment_id,
        )
        insight_status = result.status
        if result.insight is not None:
            insight_payload = result.insight.model_dump()
        insight_draft = result.draft
    return StudentAssessmentSubmissionResponse(
        assessment_id=assessment_id,
        student_id=student.id,
        answers_saved=len(request.answers),
        total_score=round(total_score, 2) if has_score and sync_skill_scores else None,
        max_score=round(max_score, 2),
        ai_insight_status=insight_status,
        ai_insight=insight_payload,
        ai_insight_draft=insight_draft,
        alert_status=alert_status,
    )


def _extract_ocr_text(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="ignore")
    text = text.replace("\x00", " ").strip()
    return re.sub(r"[ \t]+", " ", text)


def _draft_answers_from_text(extracted_text: str, questions: list[dict]) -> list[dict]:
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


def _student_answer_response(answer: dict) -> StudentAnswerResponse:
    question = repository.get_assessment_question(answer["assessment_question_id"])
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return StudentAnswerResponse(
        id=answer["id"],
        student_id=answer["student_id"],
        assessment_question_id=answer["assessment_question_id"],
        assessment_id=question["assessment_id"],
        question_text=question["question_text"],
        question_type=question["question_type"],
        choices=question["choices"],
        expected_answer=question["expected_answer"],
        skill_tag=question["skill_tag"],
        answer_text=answer["answer_text"],
        score_awarded=answer["score_awarded"],
        teacher_feedback=answer["teacher_feedback"],
        submitted_at=answer["submitted_at"],
    )


def _public_assessment_response(assessment: dict) -> PublicAssessmentResponse:
    return PublicAssessmentResponse(
        id=assessment["id"],
        class_id=assessment["class_id"],
        title=assessment["title"],
        description=assessment["description"],
        assessment_date=assessment["assessment_date"],
        duration_minutes=assessment["duration_minutes"],
        lockdown_enabled=assessment["lockdown_enabled"],
        max_violation_count=assessment["max_violation_count"],
    )
def _is_expired(expires_at: datetime) -> bool:
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return expires_at < datetime.now(UTC)


def _create_zalo_service_session(session, student) -> dict:
    settings = get_settings()
    headers = {"Content-Type": "application/json"}
    if settings.integration_shared_secret:
        headers["Authorization"] = f"Bearer {settings.integration_shared_secret}"
    with httpx.Client(timeout=5) as client:
        response = client.post(
            f"{settings.zalo_service_url.rstrip('/')}/internal/link-sessions",
            headers=headers,
            json={
                "session_id": session.id,
                "session_token": session.session_token,
                "student_id": session.student_id,
                "student_name": student.full_name,
                "student_level": student.level,
                "expires_at": session.expires_at.isoformat(),
            },
        )
        response.raise_for_status()
        return response.json()


def _assert_internal_authorized(authorization: str | None) -> None:
    secret = get_settings().integration_shared_secret
    if not secret:
        return
    if authorization != f"Bearer {secret}":
        raise HTTPException(status_code=401, detail="Invalid integration secret")


def _zalo_session_response(session) -> ZaloLinkSessionResponse:
    return ZaloLinkSessionResponse(
        id=session.id,
        student_id=session.student_id,
        channel=session.channel,
        status=session.status,
        session_token=session.session_token,
        qr_code_url=session.qr_code_url,
        deep_link_url=session.deep_link_url,
        linking_message=session.linking_message,
        bot_display_name=session.bot_display_name,
        otp_code=session.otp_code,
        otp_expires_at=session.otp_expires_at,
        sender_id=session.sender_id,
        zalo_display_name=session.zalo_display_name,
        expires_at=session.expires_at,
        error_message=session.error_message,
    )


def _zalo_channel_link_response(link) -> ZaloChannelLinkResponse:
    return ZaloChannelLinkResponse(
        id=link.id,
        student_id=link.student_id,
        channel=link.channel,
        sender_id=link.sender_id,
        zalo_display_name=link.zalo_display_name,
        status=link.status,
        created_at=link.created_at,
        updated_at=link.updated_at,
        last_message_at=link.last_message_at,
    )


def _zalo_bot_session_response(session) -> ZaloBotSessionResponse:
    return ZaloBotSessionResponse(
        id=session.id,
        account_label=session.account_label,
        adapter=session.adapter,
        status=session.status,
        encrypted_session_payload=session.encrypted_session_payload,
        bot_chat_url=session.bot_chat_url,
        bot_display_name=session.bot_display_name,
        last_login_at=session.last_login_at,
        last_error=session.last_error,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def _zalo_message_response(message) -> ZaloMessageResponse:
    return ZaloMessageResponse(
        id=message.id,
        student_id=message.student_id,
        channel_link_id=message.channel_link_id,
        sender_id=message.sender_id,
        zalo_display_name=message.zalo_display_name,
        direction=message.direction,
        content=message.content,
        raw_message_id=message.raw_message_id,
        sent_at=message.sent_at,
        created_at=message.created_at,
    )


def _read_uploads(*, file: UploadFile | None, files: list[UploadFile] | None, fallback_filename: str) -> list[dict]:
    upload_files: list[UploadFile] = []
    if files:
        upload_files.extend(files)
    if file is not None:
        upload_files.insert(0, file)
    if not upload_files:
        raise HTTPException(status_code=400, detail="At least one file is required")
    return [
        {
            "filename": upload.filename or fallback_filename,
            "content_type": upload.content_type,
            "raw": upload.file.read(),
        }
        for upload in upload_files
    ]


def _upload_batch_filename(uploads: list[dict]) -> str:
    if len(uploads) == 1:
        return str(uploads[0].get("filename") or "upload")
    return f"{len(uploads)} files"


def _create_access_token(user) -> str:
    settings = get_settings()
    jwt_secret = settings.app_secret_key
    if not jwt_secret:
        raise HTTPException(status_code=500, detail="JWT secret is required")
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "aud": "authenticated",
            "sub": user.id,
            "email": user.email,
            "role": "authenticated",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=8)).timestamp()),
            "session_epoch": settings.app_session_epoch,
        },
        jwt_secret,
        algorithm="HS256",
    )


def _user_summary(user) -> UserSummary:
    return UserSummary(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
    )
