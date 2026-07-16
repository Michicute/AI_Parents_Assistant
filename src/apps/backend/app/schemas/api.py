from datetime import date, datetime, time
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal

from app.models.domain import EnglishSkill, Intent, Role


DocumentType = Literal[
    "center_policy",
    "parent_handbook",
    "faq",
    "course_description",
    "announcement",
]
QuestionType = Literal["multiple_choice", "essay"]


class HealthResponse(BaseModel):
    status: str
    service: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    student_id: str | None = None
    locale: str | None = None


class ChatSource(BaseModel):
    kind: Literal["structured", "document"]
    title: str
    document_type: DocumentType | None = None
    source_uri: str | None = None
    chunk_id: str | None = None


class ChatResponse(BaseModel):
    intent: Intent
    intents: list[Intent] = Field(default_factory=list)
    answer: str
    sources: list[ChatSource] = Field(default_factory=list)
    retrieved_context: list[str] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)


ZaloTextStyle = Literal["b", "i", "u", "s", "ul", "ol", "red", "orange", "yellow", "green", "big", "small", "indent"]


class ZaloStyleRange(BaseModel):
    start: int = Field(ge=0)
    len: int = Field(gt=0)
    st: ZaloTextStyle
    indentSize: int | None = Field(default=None, ge=0)


class ZaloChatResponse(ChatResponse):
    styles: list[ZaloStyleRange] = Field(default_factory=list)


class DocumentCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    document_type: DocumentType
    content: str = Field(min_length=1)
    locale: str = Field(default="en", min_length=2, max_length=20)
    source_uri: str | None = None


class DocumentResponse(BaseModel):
    id: str
    title: str
    document_type: DocumentType
    locale: str
    content: str
    source_uri: str | None = None


class DocumentIngestResponse(BaseModel):
    document_id: str
    chunks_created: int


class RagFolderIngestResponse(BaseModel):
    documents_dir: str
    documents_processed: int
    chunks_created: int
    skipped_files: list[str] = Field(default_factory=list)


class RagSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    limit: int = Field(default=5, ge=1, le=5)


class RagSearchChunk(BaseModel):
    document_id: str
    document_title: str
    document_type: DocumentType
    chunk_id: str
    chunk_index: int
    content: str
    score: float
    metadata: dict = Field(default_factory=dict)


class RagSearchResponse(BaseModel):
    answer: str
    chunks: list[RagSearchChunk] = []


class DevLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class AuthRegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)


class AuthLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class UserSummary(BaseModel):
    id: str
    email: str
    role: Role
    full_name: str | None = None
    is_active: bool | None = None


class DevLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserSummary


class StudentSummary(BaseModel):
    id: str
    full_name: str
    level: str


class ClassSummary(BaseModel):
    id: str
    course_id: str
    name: str
    location: str | None = None
    schedule_note: str | None = None
    start_time: time | None = None
    end_time: time | None = None
    teacher_names: list[str] = Field(default_factory=list)


class CourseSummary(BaseModel):
    id: str
    name: str
    level: str
    description: str | None = None


class AttendanceStudentStatus(BaseModel):
    student_id: str
    full_name: str
    level: str
    status: str = "absent"
    note: str | None = None


class AttendanceSessionResponse(BaseModel):
    class_id: str
    class_date: date
    students: list[AttendanceStudentStatus]


class AttendanceUpdateItem(BaseModel):
    student_id: str
    status: str = Field(pattern="^(present|absent)$")
    note: str | None = Field(default=None, max_length=500)


class AttendanceSaveRequest(BaseModel):
    class_date: date
    records: list[AttendanceUpdateItem]


class AdminCreateClassRequest(BaseModel):
    course_id: str = Field(min_length=1)
    location: str | None = Field(default=None, max_length=200)
    starts_on: date | None = None
    ends_on: date | None = None
    schedule_note: str = Field(min_length=1, max_length=500)
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be later than start_time")
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("ends_on must not be earlier than starts_on")
        return self


class AdminCreateUserRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)


class AdminCreateParentRequest(AdminCreateUserRequest):
    preferred_language: str = Field(default="vi", min_length=2, max_length=20)


class AdminCreateTeacherResponse(BaseModel):
    user: UserSummary
    teacher: dict


class AdminCreateParentResponse(BaseModel):
    user: UserSummary
    parent: dict


class AdminCreateStudentRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    level: str = Field(min_length=1, max_length=50)
    class_id: str | None = None
    parent_user_id: str = Field(min_length=1)
    student_email: str | None = Field(default=None, max_length=320)
    student_password: str | None = Field(default=None, min_length=8, max_length=128)


class AdminLinkParentStudentRequest(BaseModel):
    parent_user_id: str
    student_id: str


class AdminAssignTeacherClassRequest(BaseModel):
    teacher_user_id: str
    class_id: str


class StudentDashboardResponse(BaseModel):
    student: StudentSummary
    progress: dict
    attendance: list[dict]
    teacher_feedback: list[dict]
    upcoming_classes: list[dict] = Field(default_factory=list)
    class_alerts: list[dict] = Field(default_factory=list)
    assignment_completion: dict = Field(default_factory=lambda: {"completed": 0, "total": 0})


class ClassDashboardResponse(BaseModel):
    class_id: str
    status: str
    skill_averages: dict[EnglishSkill, float | None] = Field(default_factory=dict)
    alerted_students: int = 0
    total_students: int = 0


TeacherAlertReason = Literal["absence_streak", "average_score_low", "latest_score_low", "latest_assessment_low"]
TeacherClassActionType = Literal["unexpected_absence_notice", "teacher_reminder", "assessment_result_notice"]


class TeachingScheduleClassAction(BaseModel):
    id: str
    action_type: TeacherClassActionType
    content: str
    scheduled_for: date | None = None
    status: str = "draft"
    sent_at: datetime | None = None


class TeachingScheduleClassItem(BaseModel):
    class_id: str
    class_name: str
    schedule_note: str | None = None
    location: str | None = None
    student_count: int
    assessment_count: int
    actions: list[TeachingScheduleClassAction] = Field(default_factory=list)


class TeachingScheduleDay(BaseModel):
    date: date
    weekday_label: str
    classes: list[TeachingScheduleClassItem]


class TeacherStudentAlert(BaseModel):
    student_id: str
    student_name: str
    class_id: str
    class_name: str
    reason: TeacherAlertReason
    reason_label: str
    metric_value: float | None = None
    metric_label: str
    occurred_on: date | None = None


class TeacherPendingAssessmentReview(BaseModel):
    assessment_id: str
    class_id: str
    class_name: str
    title: str
    submitted_count: int
    latest_submitted_at: datetime


class TeacherDashboardOverviewResponse(BaseModel):
    start: date
    days: int
    schedule_days: list[TeachingScheduleDay]
    alerts: list[TeacherStudentAlert]
    pending_assessment_reviews: list[TeacherPendingAssessmentReview] = Field(default_factory=list)


class TeacherDashboardAlertPublishResponse(BaseModel):
    alerts_checked: int
    notifications_created: int


class TeacherClassActionDraftRequest(BaseModel):
    action_type: TeacherClassActionType
    content: str = Field(min_length=1, max_length=2000)
    scheduled_for: date


class TeacherClassActionDraftResponse(BaseModel):
    id: str
    class_id: str
    teacher_user_id: str
    action_type: TeacherClassActionType
    content: str
    scheduled_for: date | None = None
    status: str = "draft"
    sent_at: datetime | None = None
    sent_by_user_id: str | None = None
    created_at: datetime


class TeacherClassActionSendResponse(BaseModel):
    draft_id: str
    class_id: str
    status: str
    students_targeted: int
    notifications_created: int
    zalo_sent: int
    zalo_not_linked: int
    zalo_failed: int


class ParentNotificationResponse(BaseModel):
    id: str
    parent_user_id: str
    student_id: str
    type: str
    title: str
    content: str
    source_type: str
    source_id: str
    created_by_user_id: str | None = None
    read_at: datetime | None = None
    sent_zalo_at: datetime | None = None
    zalo_status: str
    zalo_error: str | None = None
    metadata: dict = Field(default_factory=dict)
    created_at: datetime


class ScoreCreateRequest(BaseModel):
    skill: EnglishSkill
    score: float = Field(ge=0, le=100)
    class_id: str | None = None
    assessed_on: date | None = None
    teacher_comment: str | None = Field(default=None, max_length=1000)


class ScoreUpdateRequest(BaseModel):
    score: float | None = Field(default=None, ge=0, le=100)
    assessed_on: date | None = None
    teacher_comment: str | None = Field(default=None, max_length=1000)


class ScoreResponse(BaseModel):
    id: str
    student_id: str
    class_id: str | None
    skill: EnglishSkill
    score: float
    scale: str
    assessed_on: date
    source: str | None
    teacher_id: str | None
    teacher_comment: str | None
    trend_summary: dict = Field(default_factory=dict)
    created_at: datetime | None
    updated_at: datetime | None


class AssessmentCreateRequest(BaseModel):
    class_id: str
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    assessment_date: date | None = None
    duration_minutes: int | None = Field(default=None, gt=0, le=600)
    lockdown_enabled: bool = True
    max_violation_count: int | None = Field(default=2, ge=0, le=20)


class AssessmentSubmissionStats(BaseModel):
    total_students: int = 0
    submitted_students: int = 0
    graded_students: int = 0
    insight_students: int = 0


class AssessmentResponse(BaseModel):
    id: str
    class_id: str
    title: str
    description: str | None
    assessment_date: date | None
    duration_minutes: int | None
    lockdown_enabled: bool
    max_violation_count: int | None
    created_by_teacher_id: str | None
    created_at: datetime
    submission_stats: AssessmentSubmissionStats | None = None


class PublicAssessmentResponse(BaseModel):
    id: str
    class_id: str
    title: str
    description: str | None
    assessment_date: date | None
    duration_minutes: int | None
    lockdown_enabled: bool
    max_violation_count: int | None


class AssessmentQuestionCreateRequest(BaseModel):
    question_text: str = Field(min_length=1)
    question_type: QuestionType = "essay"
    choices: list[str] = Field(default_factory=list)
    expected_answer: str | None = None
    skill_tag: EnglishSkill
    max_score: float = Field(default=10, gt=0, le=100)
    rubric_criteria: dict = Field(default_factory=dict)
    score_range: str = Field(default="[0,10]")


class AssessmentQuestionUpdateRequest(AssessmentQuestionCreateRequest):
    pass


class AssessmentImportQuestionDraft(BaseModel):
    question_text: str = Field(min_length=1)
    question_type: QuestionType = "essay"
    choices: list[str] = Field(default_factory=list)
    expected_answer: str | None = None
    skill_tag: EnglishSkill = EnglishSkill.grammar
    max_score: float = Field(default=10, gt=0, le=100)
    position: int | None = None
    rubric_criteria: dict = Field(default_factory=dict)
    score_range: str = Field(default="[0,10]")


class AssessmentImportDraftResponse(BaseModel):
    class_id: str
    filename: str
    extraction_method: str | None = None
    title: str
    description: str | None = None
    assessment_date: date | None = None
    questions: list[AssessmentImportQuestionDraft] = Field(min_length=1)
    warnings: list[str] = Field(default_factory=list)


class AssessmentImportRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    assessment_date: date | None = None
    duration_minutes: int | None = Field(default=None, gt=0, le=600)
    lockdown_enabled: bool = True
    max_violation_count: int | None = Field(default=2, ge=0, le=20)
    questions: list[AssessmentImportQuestionDraft] = Field(min_length=1)


class AssessmentQuestionResponse(BaseModel):
    id: str
    assessment_id: str
    question_text: str
    question_type: QuestionType
    choices: list[str]
    expected_answer: str | None
    skill_tag: EnglishSkill
    max_score: float
    position: int
    rubric_criteria: dict
    score_range: str
    created_at: datetime


class AssessmentImportResponse(BaseModel):
    assessment: AssessmentResponse
    questions: list[AssessmentQuestionResponse]


class PublicAssessmentQuestionResponse(BaseModel):
    id: str
    assessment_id: str
    question_text: str
    question_type: QuestionType
    choices: list[str]
    skill_tag: EnglishSkill
    max_score: float
    position: int


class AssessmentPrintViewResponse(BaseModel):
    assessment: PublicAssessmentResponse
    questions: list[PublicAssessmentQuestionResponse]


class StudentAssessmentListItem(BaseModel):
    id: str
    class_id: str
    title: str
    description: str | None
    assessment_date: date | None
    duration_minutes: int | None
    lockdown_enabled: bool
    max_violation_count: int | None
    question_count: int
    submitted: bool


class StudentAssessmentAttemptResponse(BaseModel):
    id: str
    started_at: datetime
    expires_at: datetime | None
    submitted_at: datetime | None
    status: str
    violation_count: int


class StudentAssessmentDetailResponse(BaseModel):
    assessment: PublicAssessmentResponse
    student: StudentSummary
    questions: list[PublicAssessmentQuestionResponse]
    submitted: bool
    submitted_answers: list[dict] = Field(default_factory=list)
    attempt: StudentAssessmentAttemptResponse | None = None
    server_now: datetime


class StudentAnswerCreateRequest(BaseModel):
    student_id: str
    answer_text: str = Field(min_length=1)
    score_awarded: float | None = Field(default=None, ge=0, le=100)
    teacher_feedback: str | None = Field(default=None, max_length=1000)
    submitted_at: datetime | None = None


class StudentAnswerResponse(BaseModel):
    id: str
    student_id: str
    assessment_question_id: str
    assessment_id: str
    question_text: str
    question_type: QuestionType
    choices: list[str]
    expected_answer: str | None
    skill_tag: EnglishSkill
    answer_text: str
    score_awarded: float | None = None
    teacher_feedback: str | None = None
    submitted_at: datetime

class StudentAssessmentAnswerInput(BaseModel):
    question_id: str
    answer_text: str = Field(min_length=1)
    score_awarded: float | None = Field(default=None, ge=0, le=100)
    teacher_feedback: str | None = Field(default=None, max_length=1000)


class StudentAssessmentSubmissionRequest(BaseModel):
    student_id: str
    submitted_at: datetime | None = None
    attempt_id: str | None = None
    answers: list[StudentAssessmentAnswerInput] = Field(min_length=1)


AssessmentAttemptEventType = Literal[
    "started",
    "fullscreen_exit",
    "tab_hidden",
    "window_blur",
    "copy_attempt",
    "paste_attempt",
    "context_menu_attempt",
    "expired",
    "submitted",
]


class AssessmentAttemptEventRequest(BaseModel):
    event_type: AssessmentAttemptEventType
    occurred_at: datetime | None = None
    metadata: dict = Field(default_factory=dict)


class StudentAssessmentSubmissionResponse(BaseModel):
    assessment_id: str
    student_id: str
    answers_saved: int
    total_score: float | None = None
    max_score: float
    ai_insight_status: str | None = None
    ai_insight: dict | None = None
    ai_insight_draft: dict | None = None
    alert_status: dict | None = None


class AiInsightApprovalRequest(BaseModel):
    assessment_id: str | None = None
    content: str = Field(min_length=1)
    retrieved_context: list[dict] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("AI Insight content cannot be blank")
        return stripped


class OcrDraftAnswer(BaseModel):
    question_id: str
    answer_text: str = ""


class OcrDraftResponse(BaseModel):
    assessment_id: str
    student_id: str
    filename: str
    extraction_method: str | None = None
    extracted_text: str
    answers: list[OcrDraftAnswer]
    warning: str | None = None
    warnings: list[str] = Field(default_factory=list)


class StudentAssessmentSummaryResponse(BaseModel):
    student_id: str
    assessment_id: str | None = None
    assessments: list[dict]
    skill_summary: dict
    strengths: list[str]
    weaknesses: list[str]

class ZaloLinkSessionCreateRequest(BaseModel):
    student_id: str

class StudentZaloQrResponse(BaseModel):
    student_id: str
    status: str
    connected: bool = False
    qr_code_url: str | None = None
    deep_link_url: str | None = None
    linking_message: str | None = None
    bot_display_name: str | None = None
    session_token: str | None = None
    otp_code: str | None = None
    otp_expires_at: datetime | None = None
    expires_at: datetime | None = None
    sender_id: str | None = None
    zalo_display_name: str | None = None
    error_message: str | None = None


class ZaloLinkSessionResponse(BaseModel):
    id: str
    student_id: str
    channel: str = "zalo"
    status: str
    session_token: str
    qr_code_url: str | None = None
    deep_link_url: str | None = None
    linking_message: str | None = None
    bot_display_name: str | None = None
    otp_code: str | None = None
    otp_expires_at: datetime | None = None
    sender_id: str | None = None
    zalo_display_name: str | None = None
    expires_at: datetime
    error_message: str | None = None


class ZaloLinkSessionCompleteRequest(BaseModel):
    sender_id: str = Field(min_length=1, max_length=200)
    zalo_display_name: str | None = Field(default=None, max_length=200)


class ZaloLinkSessionFailRequest(BaseModel):
    status: str = Field(pattern="^(failed|expired)$")
    error_message: str | None = Field(default=None, max_length=1000)


class ZaloLinkSessionResolveOtpRequest(BaseModel):
    otp_code: str = Field(min_length=4, max_length=20)


class ZaloLinkSessionResolveOtpResponse(BaseModel):
    session_id: str
    session_token: str
    student_id: str
    student_name: str
    student_level: str | None = None
    expires_at: datetime


class ZaloChannelLinkResponse(BaseModel):
    id: str
    student_id: str
    channel: str = "zalo"
    sender_id: str
    zalo_display_name: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime | None = None



class ZaloBotSessionResponse(BaseModel):
    id: str
    account_label: str
    adapter: str = "zca-js"
    status: str
    encrypted_session_payload: str | None = None
    bot_chat_url: str | None = None
    bot_display_name: str | None = None
    last_login_at: datetime | None = None
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime


class ZaloBotSessionUpsertRequest(BaseModel):
    adapter: str = Field(default="zca-js", max_length=50)
    status: str = Field(default="disconnected", max_length=50)
    encrypted_session_payload: str | None = None
    bot_chat_url: str | None = None
    bot_display_name: str | None = Field(default=None, max_length=200)
    last_login_at: datetime | None = None
    last_error: str | None = Field(default=None, max_length=2000)


class ZaloMessageLogRequest(BaseModel):
    sender_id: str = Field(min_length=1, max_length=200)
    direction: str = Field(pattern="^(inbound|outbound)$")
    content: str = Field(min_length=1)
    zalo_display_name: str | None = Field(default=None, max_length=200)
    student_id: str | None = None
    channel_link_id: str | None = None
    raw_message_id: str | None = Field(default=None, max_length=200)
    sent_at: datetime | None = None


class ZaloChatRequest(BaseModel):
    sender_id: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1)
    zalo_display_name: str | None = Field(default=None, max_length=200)
    locale: str | None = Field(default="vi", min_length=2, max_length=20)


class ZaloMessageResponse(BaseModel):
    id: str
    student_id: str | None = None
    channel_link_id: str | None = None
    sender_id: str
    zalo_display_name: str | None = None
    direction: str
    content: str
    raw_message_id: str | None = None
    sent_at: datetime
    created_at: datetime


class ZaloChatThreadResponse(BaseModel):
    student_id: str | None = None
    student_name: str | None = None
    student_level: str | None = None
    sender_id: str
    zalo_display_name: str | None = None
    channel_link_id: str | None = None
    link_status: str
    last_message_at: datetime | None = None
    last_message_preview: str | None = None
    last_message_direction: str | None = None
    message_count: int


class AiInsightResponse(BaseModel):
    id: str
    user_id: str | None = None
    student_id: str | None = None
    assessment_id: str | None = None
    insight_type: str
    content: str
    retrieved_context: list[dict] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)
    is_stale: bool = False
    stale_reason: str | None = None
