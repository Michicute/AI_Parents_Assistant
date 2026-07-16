from datetime import date, datetime, time
from enum import StrEnum
from pydantic import BaseModel, Field


class Role(StrEnum):
    admin = "ADMIN"
    teacher = "TEACHER"
    parent = "PARENT"
    student = "STUDENT"


class EnglishSkill(StrEnum):
    reading = "reading"
    listening = "listening"
    speaking = "speaking"
    writing = "writing"
    grammar = "grammar"
    vocabulary = "vocabulary"


class Intent(StrEnum):
    student_progress = "student_progress"
    assignment_status = "assignment_status"
    attendance_summary = "attendance_summary"
    schedule = "schedule"
    course_information = "course_information"
    school_policy = "school_policy"
    center_policy = "center_policy"
    parent_handbook = "parent_handbook"
    announcement = "announcement"
    teacher_contact = "teacher_contact"
    general_parent_support = "general_parent_support"
    student_answer_analysis = "student_answer_analysis"
    assessment_summary = "assessment_summary"


class Principal(BaseModel):
    user_id: str
    email: str
    role: Role
    linked_student_ids: list[str] = Field(default_factory=list)
    assigned_class_ids: list[str] = Field(default_factory=list)


class Student(BaseModel):
    id: str
    full_name: str
    level: str
    class_ids: list[str] = Field(default_factory=list)


class Assignment(BaseModel):
    id: str
    student_id: str
    title: str
    status: str
    due_date: date | None = None


class AttendanceRecord(BaseModel):
    id: str
    student_id: str
    class_id: str | None = None
    class_date: date
    status: str
    note: str | None = None


class TeacherFeedback(BaseModel):
    id: str
    student_id: str
    teacher_name: str
    comment: str
    created_at: datetime


class AssessmentQuestion(BaseModel):
    id: str
    assessment_id: str
    skill: str
    prompt: str
    rubric: str
    max_score: float


class StudentAnswer(BaseModel):
    id: str
    student_id: str
    question_id: str
    answer_text: str
    submitted_at: datetime


class StudentAnswerAnalysis(BaseModel):
    id: str
    student_answer_id: str
    strengths: list[str]
    improvement_areas: list[str]
    cefr_signal: str | None = None
    parent_insight: str
    home_support_recommendations: list[str]
    created_at: datetime


class RagDocument(BaseModel):
    id: str
    title: str
    source_type: str
    content: str
    locale: str = "vi"
    score: float | None = None
    metadata: dict = Field(default_factory=dict)


class UserRecord(BaseModel):
    id: str
    email: str
    full_name: str
    role: Role
    is_active: bool = True
    hashed_password: str | None = None


class Teacher(BaseModel):
    id: str
    user_id: str
    display_name: str
    email: str


class Course(BaseModel):
    id: str
    name: str
    level: str
    description: str | None = None
    objectives: list[str] = Field(default_factory=list)


class ClassRecord(BaseModel):
    id: str
    course_id: str
    name: str
    location: str | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    schedule_note: str | None = None
    start_time: time | None = None
    end_time: time | None = None


class ParentProfile(BaseModel):
    id: str
    user_id: str
    display_name: str
    email: str
    preferred_language: str = "vi"


class Enrollment(BaseModel):
    id: str
    student_id: str
    class_id: str
    enrolled_on: date
    status: str = "active"


class SkillScore(BaseModel):
    id: str
    student_id: str
    class_id: str | None = None
    skill: EnglishSkill
    score: float
    scale: str = "percent"
    assessed_on: date
    source: str | None = None
    teacher_id: str | None = None
    teacher_comment: str | None = None
    trend_summary: dict = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class Assessment(BaseModel):
    id: str
    class_id: str
    title: str
    description: str | None = None
    assessment_date: date | None = None


class AssessmentQuestionRecord(BaseModel):
    id: str
    assessment_id: str
    question_text: str
    expected_answer: str | None = None
    skill_tag: EnglishSkill
    max_score: float
    position: int = 1


class Rubric(BaseModel):
    id: str
    assessment_question_id: str
    criteria: dict
    score_range: str


class StudentAnswerRecord(BaseModel):
    id: str
    student_id: str
    assessment_question_id: str
    answer_text: str
    submitted_at: datetime


class AnswerAnalysisRecord(BaseModel):
    id: str
    student_answer_id: str
    is_correct: bool
    score_suggestion: float
    strengths: list[str]
    mistakes: list[str]
    missing_concepts: list[str]
    skill_tags: list[EnglishSkill]
    parent_friendly_explanation: str
    suggested_parent_actions: list[str]
    confidence: float
    created_at: datetime


class Document(BaseModel):
    id: str
    title: str
    document_type: str
    locale: str = "en"
    content: str
    source_uri: str | None = None


class DocumentChunk(BaseModel):
    id: str
    document_id: str
    chunk_index: int
    content: str
    metadata: dict = Field(default_factory=dict)


class AiInsight(BaseModel):
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


class ZaloLinkSession(BaseModel):
    id: str
    student_id: str
    created_by_user_id: str | None = None
    channel: str = "zalo"
    status: str = "pending"
    session_token: str
    qr_code_url: str | None = None
    deep_link_url: str | None = None
    linking_message: str | None = None
    bot_display_name: str | None = None
    otp_code: str | None = None
    otp_expires_at: datetime | None = None
    otp_used_at: datetime | None = None
    otp_attempt_count: int = 0
    sender_id: str | None = None
    zalo_display_name: str | None = None
    error_message: str | None = None
    expires_at: datetime
    created_at: datetime
    updated_at: datetime


class StudentChannelLink(BaseModel):
    id: str
    student_id: str
    channel: str = "zalo"
    sender_id: str
    zalo_display_name: str | None = None
    linked_by_user_id: str | None = None
    linked_via_session_id: str | None = None
    status: str = "active"
    last_message_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ZaloBotSession(BaseModel):
    id: str
    account_label: str
    adapter: str = "zca-js"
    status: str = "disconnected"
    encrypted_session_payload: str | None = None
    bot_chat_url: str | None = None
    bot_display_name: str | None = None
    last_login_at: datetime | None = None
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime


class ZaloMessage(BaseModel):
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


class StudentAlertEventRecord(BaseModel):
    id: str
    student_id: str
    class_id: str | None = None
    assessment_id: str | None = None
    reason: str
    reason_label: str
    metric_value: float | None = None
    metric_label: str
    occurred_on: date | None = None
    notified_at: datetime | None = None
    metadata: dict = Field(default_factory=dict)
    created_at: datetime


class ParentNotificationRecord(BaseModel):
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
    zalo_status: str = "skipped"
    zalo_error: str | None = None
    metadata: dict = Field(default_factory=dict)
    created_at: datetime
