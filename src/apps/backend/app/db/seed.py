from datetime import UTC, date, datetime

from sqlalchemy import text

from app.core.password import hash_password
from app.db.base import Base
from app.db.models import (
    AiInsight,
    Assessment,
    AssessmentQuestion,
    AttendanceRecord,
    Class,
    Course,
    Document,
    Enrollment,
    Parent,
    ParentStudentLink,
    Student,
    StudentAnswer,
    Teacher,
    TeacherClassActionDraft,
    TeacherClassLink,
    TeacherFeedback,
    User,
)
from app.db.session import SessionLocal, engine


def upsert(db, model, pk: str, **values):
    row = db.get(model, pk)
    if row is None:
        row = model(id=pk, **values)
        db.add(row)
        return row
    for key, value in values.items():
        setattr(row, key, value)
    return row


def ensure_schema() -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE IF EXISTS assessment_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(30) NOT NULL DEFAULT 'essay'"))
        conn.execute(text("ALTER TABLE IF EXISTS assessment_questions ADD COLUMN IF NOT EXISTS choices JSON NOT NULL DEFAULT '[]'"))
        conn.execute(text("ALTER TABLE IF EXISTS assessments ADD COLUMN IF NOT EXISTS duration_minutes INTEGER"))
        conn.execute(text("ALTER TABLE IF EXISTS assessments ADD COLUMN IF NOT EXISTS lockdown_enabled BOOLEAN NOT NULL DEFAULT TRUE"))
        conn.execute(text("ALTER TABLE IF EXISTS assessments ADD COLUMN IF NOT EXISTS max_violation_count INTEGER DEFAULT 2"))
        conn.execute(text("ALTER TABLE IF EXISTS student_answers ADD COLUMN IF NOT EXISTS score_awarded DOUBLE PRECISION"))
        conn.execute(text("ALTER TABLE IF EXISTS student_answers ADD COLUMN IF NOT EXISTS teacher_feedback TEXT"))
        conn.execute(text("ALTER TABLE IF EXISTS attendance_records ADD COLUMN IF NOT EXISTS class_id VARCHAR REFERENCES classes(id) ON DELETE CASCADE"))
        conn.execute(text("ALTER TABLE IF EXISTS skill_scores ADD COLUMN IF NOT EXISTS trend_summary JSON NOT NULL DEFAULT '{}'"))
        conn.execute(text("ALTER TABLE IF EXISTS document_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536)"))
        conn.execute(text("ALTER TABLE IF EXISTS students ADD COLUMN IF NOT EXISTS user_id VARCHAR UNIQUE REFERENCES users(id) ON DELETE SET NULL"))
        conn.execute(text("ALTER TABLE IF EXISTS parents ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(20) NOT NULL DEFAULT 'vi'"))
        conn.execute(text("ALTER TABLE IF EXISTS ai_insights ADD COLUMN IF NOT EXISTS assessment_id VARCHAR REFERENCES assessments(id) ON DELETE CASCADE"))
        conn.execute(text("ALTER TABLE IF EXISTS zalo_link_sessions ADD COLUMN IF NOT EXISTS otp_code VARCHAR(20)"))
        conn.execute(text("ALTER TABLE IF EXISTS zalo_link_sessions ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ"))
        conn.execute(text("ALTER TABLE IF EXISTS zalo_link_sessions ADD COLUMN IF NOT EXISTS otp_used_at TIMESTAMPTZ"))
        conn.execute(text("ALTER TABLE IF EXISTS zalo_link_sessions ADD COLUMN IF NOT EXISTS otp_attempt_count INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS zalo_bot_sessions ADD COLUMN IF NOT EXISTS bot_chat_url TEXT"))
        conn.execute(text("ALTER TABLE IF EXISTS zalo_bot_sessions ADD COLUMN IF NOT EXISTS bot_display_name VARCHAR(200)"))
        conn.execute(text("ALTER TABLE IF EXISTS teacher_class_action_drafts ADD COLUMN IF NOT EXISTS scheduled_for DATE"))
        conn.execute(text("ALTER TABLE IF EXISTS teacher_class_action_drafts ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'draft'"))
        conn.execute(text("ALTER TABLE IF EXISTS teacher_class_action_drafts ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ"))
        conn.execute(text("ALTER TABLE IF EXISTS teacher_class_action_drafts ADD COLUMN IF NOT EXISTS sent_by_user_id VARCHAR REFERENCES users(id)"))
        conn.execute(text("ALTER TABLE IF EXISTS classes ADD COLUMN IF NOT EXISTS start_time TIME"))
        conn.execute(text("ALTER TABLE IF EXISTS classes ADD COLUMN IF NOT EXISTS end_time TIME"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS scheduled_zalo_notifications (
                id VARCHAR PRIMARY KEY,
                parent_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                student_id VARCHAR NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                source_type VARCHAR(100) NOT NULL,
                source_id VARCHAR NOT NULL,
                send_at TIMESTAMPTZ NOT NULL,
                title VARCHAR(300) NOT NULL,
                content TEXT NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                sent_at TIMESTAMPTZ,
                last_error TEXT,
                metadata JSON NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT uq_scheduled_zalo_source_parent_student UNIQUE (parent_user_id, student_id, source_type, source_id)
            )
        """))
    with engine.begin() as conn:
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_zalo_link_sessions_otp_code ON zalo_link_sessions (otp_code)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_scheduled_zalo_notifications_due ON scheduled_zalo_notifications (status, send_at)"))
        conn.execute(text("UPDATE zalo_link_sessions SET otp_expires_at = expires_at WHERE otp_expires_at IS NULL"))
        conn.execute(text("UPDATE zalo_link_sessions SET otp_attempt_count = 0 WHERE otp_attempt_count IS NULL"))
        conn.execute(text("UPDATE zalo_link_sessions SET otp_code = LPAD((FLOOR(RANDOM() * 1000000))::INT::TEXT, 6, '0') WHERE otp_code IS NULL AND status IN ('pending', 'link_ready')"))
        conn.execute(text("UPDATE zalo_link_sessions SET otp_used_at = COALESCE(otp_used_at, updated_at) WHERE status = 'connected' AND otp_used_at IS NULL"))


def seed() -> None:
    ensure_schema()
    with SessionLocal() as db:
        default_password = hash_password("Password123!")
        upsert(db, User, "admin-1", email="admin@englishcenter.test", full_name="Avery Admin", role="ADMIN", hashed_password=default_password, is_active=True)
        upsert(db, User, "teacher-1", email="teacher.lan@englishcenter.test", full_name="Lan Nguyen", role="TEACHER", hashed_password=default_password, is_active=True)
        upsert(db, User, "parent-1", email="parent.minh@englishcenter.test", full_name="Hoa Nguyen", role="PARENT", hashed_password=default_password, is_active=True)
        upsert(db, User, "parent-2", email="parent.linh@englishcenter.test", full_name="Quan Tran", role="PARENT", hashed_password=default_password, is_active=True)
        upsert(db, User, "student-user-a", email="minh.student@englishcenter.test", full_name="Minh Nguyen", role="STUDENT", hashed_password=default_password, is_active=True)
        upsert(db, User, "student-user-b", email="linh.student@englishcenter.test", full_name="Linh Tran", role="STUDENT", hashed_password=default_password, is_active=True)
        db.flush()

        upsert(db, Teacher, "teacher-profile-1", user_id="teacher-1", display_name="Ms. Lan", email="teacher.lan@englishcenter.test")
        upsert(db, Parent, "parent-profile-1", user_id="parent-1", display_name="Hoa Nguyen", email="parent.minh@englishcenter.test", preferred_language="vi")
        upsert(db, Parent, "parent-profile-2", user_id="parent-2", display_name="Quan Tran", email="parent.linh@englishcenter.test", preferred_language="vi")

        course_catalog = [
            ("course-a1", "Beginner", "A1", "Build foundational vocabulary, listening confidence, pronunciation, and simple sentence control."),
            ("course-a2", "Elementary", "A2", "Develop basic communication, short-text comprehension, core grammar, and guided paragraph writing."),
            ("course-b1", "Intermediate", "B1", "Strengthen independent communication, paragraph writing, comprehension, and self-correction."),
            ("course-b2", "Upper-intermediate", "B2", "Develop academic vocabulary, critical reading, structured writing, discussion, and presentation skills."),
            ("course-c1", "Advanced", "C1", "Build flexible, fluent, and precise English for complex academic and professional communication."),
            ("course-c2", "Mastery", "C2", "Refine near-native precision, nuance, rhetorical control, and advanced independent communication."),
        ]
        for course_id, name, level, description in course_catalog:
            upsert(db, Course, course_id, name=name, level=level, description=description, objectives=[])
        db.flush()

        upsert(db, Class, "class-a", course_id="course-a2", name="A2 Foundations - Saturday Morning", location="Room 3", starts_on=date(2026, 5, 2), ends_on=date(2026, 8, 29), schedule_note="Saturdays 09:00-10:30")
        upsert(db, Class, "class-b", course_id="course-a2", name="A2 Foundations - Sunday Morning", location="Room 4", starts_on=date(2026, 5, 3), ends_on=date(2026, 8, 30), schedule_note="Sundays 09:00-10:30")
        db.flush()

        upsert(db, Student, "student-a", user_id="student-user-a", full_name="Minh Nguyen", current_level="A2")
        upsert(db, Student, "student-b", user_id="student-user-b", full_name="Linh Tran", current_level="B1")
        db.flush()

        upsert(db, Enrollment, "enrollment-a", student_id="student-a", class_id="class-a", enrolled_on=date(2026, 5, 2), status="active")
        upsert(db, Enrollment, "enrollment-b", student_id="student-b", class_id="class-b", enrolled_on=date(2026, 5, 3), status="active")
        upsert(db, ParentStudentLink, "parent-student-a", parent_user_id="parent-1", student_id="student-a", relationship="parent")
        upsert(db, ParentStudentLink, "parent-student-b", parent_user_id="parent-2", student_id="student-b", relationship="parent")
        upsert(db, TeacherClassLink, "teacher-class-a", teacher_user_id="teacher-1", class_id="class-a", role="primary_teacher")
        db.flush()

        upsert(db, Assessment, "assessment-a2-progress-1", class_id="class-a", title="A2 English Progress Test 1", description="Short English test covering reading, grammar, and guided writing.", assessment_date=date(2026, 5, 30), created_by_teacher_id="teacher-1", created_at=datetime(2026, 5, 30, 8, 0, tzinfo=UTC))
        db.flush()

        upsert(db, AssessmentQuestion, "question-reading-1", assessment_id="assessment-a2-progress-1", question_text="Reading: Tom visits his grandmother every Sunday. What does Tom do after lunch?", expected_answer="He walks in the park with his grandmother.", skill_tag="reading", max_score=10, position=1, rubric_criteria={"comprehension": "Identifies the correct action after lunch", "evidence": "Uses information from the passage"}, score_range="[0,10]", created_at=datetime(2026, 5, 30, 8, 5, tzinfo=UTC))
        upsert(db, AssessmentQuestion, "question-grammar-1", assessment_id="assessment-a2-progress-1", question_text="Grammar: Yesterday, Anna ___ to school by bus. (go / went / goes)", expected_answer="went", skill_tag="grammar", max_score=10, position=2, rubric_criteria={"grammar_accuracy": "Uses past simple form correctly"}, score_range="[0,10]", created_at=datetime(2026, 5, 30, 8, 10, tzinfo=UTC))
        db.flush()

        upsert(db, StudentAnswer, "answer-reading-a", student_id="student-a", assessment_question_id="question-reading-1", answer_text="Tom walk in the park with grandmother.", submitted_at=datetime(2026, 5, 30, 10, 5, tzinfo=UTC))

        upsert(db, AttendanceRecord, "attendance-1", student_id="student-a", class_id="class-a", class_date=date(2026, 5, 29), status="present", note=None)
        upsert(db, TeacherFeedback, "feedback-1", student_id="student-a", teacher_name="Ms. Lan", comment="Minh participates more in pair work and should keep practicing full-sentence answers.", created_at=datetime(2026, 5, 30, 10, 30, tzinfo=UTC))
        upsert(db, AiInsight, "insight-student-a", user_id=None, student_id="student-a", insight_type="progress", content="Seed insight", retrieved_context=[], safety_notes=[], is_stale=False, stale_reason=None)

        upsert(db, Document, "doc-1", title="Parent Handbook: Homework Support", document_type="parent_handbook", locale="en", content="Parents should encourage reading routines and ask guiding questions, but should not complete homework for students.", source_uri=None)
        upsert(db, Document, "doc-2", title="Assessment Policy", document_type="center_policy", locale="en", content="English assessments combine class participation, homework completion, rubric-based writing and speaking tasks, and teacher feedback.", source_uri=None)
        db.commit()


if __name__ == "__main__":
    seed()
