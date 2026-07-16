import json
import re
import secrets
from datetime import UTC, date, datetime, time, timedelta
from uuid import uuid4

from sqlalchemy import delete, or_, select, text, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.password import hash_password
from app.db import models as orm
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.domain import (
    AssessmentQuestion,
    AttendanceRecord,
    AnswerAnalysisRecord,
    ClassRecord,
    Course,
    EnglishSkill,
    ParentNotificationRecord,
    ParentProfile,
    RagDocument,
    Role,
    SkillScore,
    Student,
    StudentAlertEventRecord,
    AiInsight,
    StudentAnswerAnalysis,
    TeacherFeedback,
    UserRecord,
    ZaloBotSession,
    ZaloLinkSession,
    ZaloMessage,
    StudentChannelLink,
)
from app.services.assessment_scoring import auto_score_answer
from app.services.rubric_templates import normalize_rubric_criteria


class PostgresRepository:
    def __init__(self) -> None:
        pass

    def _session(self) -> Session:
        return SessionLocal()

    def _user_from_row(self, row: orm.User) -> UserRecord:
        return UserRecord(
            id=row.id,
            email=row.email,
            full_name=row.full_name,
            role=Role(row.role),
            is_active=row.is_active,
            hashed_password=row.hashed_password,
        )

    def _student_from_row(self, db: Session, row: orm.Student) -> Student:
        class_ids = db.scalars(
            select(orm.Enrollment.class_id).where(
                orm.Enrollment.student_id == row.id,
                orm.Enrollment.status == "active",
            )
        ).all()
        return Student(id=row.id, full_name=row.full_name, level=row.current_level, class_ids=list(class_ids))

    def _class_from_row(self, row: orm.Class) -> ClassRecord:
        return ClassRecord(
            id=row.id,
            course_id=row.course_id,
            name=row.name,
            location=row.location,
            starts_on=row.starts_on,
            ends_on=row.ends_on,
            schedule_note=row.schedule_note,
            start_time=row.start_time,
            end_time=row.end_time,
        )

    def _score_from_row(self, row: orm.SkillScore) -> SkillScore:
        return SkillScore(
            id=row.id,
            student_id=row.student_id,
            class_id=row.class_id,
            skill=EnglishSkill(row.skill),
            score=row.score,
            scale=row.scale,
            assessed_on=row.assessed_on,
            source=row.source,
            teacher_id=row.teacher_id,
            teacher_comment=row.teacher_comment,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def _zalo_session_from_row(self, row: orm.ZaloLinkSession) -> ZaloLinkSession:
        return ZaloLinkSession(
            id=row.id,
            student_id=row.student_id,
            created_by_user_id=row.created_by_user_id,
            channel=row.channel,
            status=row.status,
            session_token=row.session_token,
            qr_code_url=row.qr_code_url,
            deep_link_url=row.deep_link_url,
            linking_message=row.linking_message,
            bot_display_name=row.bot_display_name,
            otp_code=row.otp_code,
            otp_expires_at=row.otp_expires_at,
            otp_used_at=row.otp_used_at,
            otp_attempt_count=row.otp_attempt_count,
            sender_id=row.sender_id,
            zalo_display_name=row.zalo_display_name,
            error_message=row.error_message,
            expires_at=row.expires_at,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def _generate_zalo_link_otp(self) -> str:
        return f"{secrets.randbelow(1000000):06d}"

    def _channel_link_from_row(self, row: orm.StudentChannelLink) -> StudentChannelLink:
        return StudentChannelLink(
            id=row.id,
            student_id=row.student_id,
            channel=row.channel,
            sender_id=row.sender_id,
            zalo_display_name=row.zalo_display_name,
            linked_by_user_id=row.linked_by_user_id,
            linked_via_session_id=row.linked_via_session_id,
            status=row.status,
            last_message_at=row.last_message_at,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def _zalo_message_from_row(self, row: orm.ZaloMessage) -> ZaloMessage:
        return ZaloMessage(
            id=row.id,
            student_id=row.student_id,
            channel_link_id=row.channel_link_id,
            sender_id=row.sender_id,
            zalo_display_name=row.zalo_display_name,
            direction=row.direction,
            content=row.content,
            raw_message_id=row.raw_message_id,
            sent_at=row.sent_at,
            created_at=row.created_at,
        )

    def _student_alert_event_from_row(self, row: orm.StudentAlertEvent) -> StudentAlertEventRecord:
        return StudentAlertEventRecord(
            id=row.id,
            student_id=row.student_id,
            class_id=row.class_id,
            assessment_id=row.assessment_id,
            reason=row.reason,
            reason_label=row.reason_label,
            metric_value=row.metric_value,
            metric_label=row.metric_label,
            occurred_on=row.occurred_on,
            notified_at=row.notified_at,
            metadata=row.meta or {},
            created_at=row.created_at,
        )

    def _parent_notification_from_row(self, row: orm.ParentNotification) -> ParentNotificationRecord:
        return ParentNotificationRecord(
            id=row.id,
            parent_user_id=row.parent_user_id,
            student_id=row.student_id,
            type=row.type,
            title=row.title,
            content=row.content,
            source_type=row.source_type,
            source_id=row.source_id,
            created_by_user_id=row.created_by_user_id,
            read_at=row.read_at,
            sent_zalo_at=row.sent_zalo_at,
            zalo_status=row.zalo_status,
            zalo_error=row.zalo_error,
            metadata=row.meta or {},
            created_at=row.created_at,
        )

    def _scheduled_zalo_notification_dict(self, row: orm.ScheduledZaloNotification) -> dict:
        return {
            "id": row.id,
            "parent_user_id": row.parent_user_id,
            "student_id": row.student_id,
            "source_type": row.source_type,
            "source_id": row.source_id,
            "send_at": row.send_at,
            "title": row.title,
            "content": row.content,
            "status": row.status,
            "sent_at": row.sent_at,
            "last_error": row.last_error,
            "metadata": row.meta or {},
            "created_at": row.created_at,
        }

    def _zalo_bot_session_from_row(self, row: orm.ZaloBotSession) -> ZaloBotSession:
        return ZaloBotSession(
            id=row.id,
            account_label=row.account_label,
            adapter=row.adapter,
            status=row.status,
            encrypted_session_payload=row.encrypted_session_payload,
            bot_chat_url=row.bot_chat_url,
            bot_display_name=row.bot_display_name,
            last_login_at=row.last_login_at,
            last_error=row.last_error,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def get_user(self, user_id: str) -> UserRecord | None:
        with self._session() as db:
            row = db.get(orm.User, user_id)
            return self._user_from_row(row) if row else None

    def get_user_by_auth_subject(self, auth_subject: str) -> UserRecord | None:
        return self.get_user(auth_subject)

    def get_user_by_email(self, email: str) -> UserRecord | None:
        with self._session() as db:
            row = db.scalar(select(orm.User).where(orm.User.email == email.lower()))
            return self._user_from_row(row) if row else None

    def list_users(self) -> list[UserRecord]:
        with self._session() as db:
            return [self._user_from_row(row) for row in db.scalars(select(orm.User).order_by(orm.User.created_at)).all()]

    def list_teachers(self) -> list[dict]:
        with self._session() as db:
            rows = db.scalars(select(orm.Teacher)).all()
            return [{"id": r.id, "user_id": r.user_id, "display_name": r.display_name, "email": r.email} for r in rows]

    def list_parents(self) -> list[ParentProfile]:
        with self._session() as db:
            return [
                ParentProfile(
                    id=r.id,
                    user_id=r.user_id,
                    display_name=r.display_name,
                    email=r.email,
                    preferred_language=r.preferred_language or "vi",
                )
                for r in db.scalars(select(orm.Parent)).all()
            ]

    def list_students(self) -> list[Student]:
        with self._session() as db:
            return [self._student_from_row(db, row) for row in db.scalars(select(orm.Student)).all()]

    def get_students_for_student_user(self, user_id: str) -> list[Student]:
        with self._session() as db:
            return [
                self._student_from_row(db, row)
                for row in db.scalars(select(orm.Student).where(orm.Student.user_id == user_id)).all()
            ]

    def delete_user(self, user_id: str) -> bool:
        with self._session() as db:
            row = db.get(orm.User, user_id)
            if row is None:
                return False
            db.execute(delete(orm.AuditLog).where(orm.AuditLog.actor_user_id == user_id))
            db.execute(delete(orm.AiInsight).where(orm.AiInsight.user_id == user_id))
            db.execute(update(orm.SkillScore).where(orm.SkillScore.teacher_id == user_id).values(teacher_id=None))
            db.execute(update(orm.Assessment).where(orm.Assessment.created_by_teacher_id == user_id).values(created_by_teacher_id=None))
            db.execute(delete(orm.TeacherClassLink).where(orm.TeacherClassLink.teacher_user_id == user_id))
            db.execute(delete(orm.ParentStudentLink).where(orm.ParentStudentLink.parent_user_id == user_id))
            db.execute(delete(orm.Teacher).where(orm.Teacher.user_id == user_id))
            db.execute(delete(orm.Parent).where(orm.Parent.user_id == user_id))
            db.execute(update(orm.Student).where(orm.Student.user_id == user_id).values(user_id=None))
            db.delete(row)
            db.commit()
            return True

    def delete_student(self, student_id: str) -> bool:
        with self._session() as db:
            row = db.get(orm.Student, student_id)
            if row is None:
                return False
            db.execute(delete(orm.AiInsight).where(orm.AiInsight.student_id == student_id))
            db.delete(row)
            db.commit()
            return True

    def list_classes(self) -> list[ClassRecord]:
        with self._session() as db:
            return [self._class_from_row(row) for row in db.scalars(select(orm.Class)).all()]

    def get_class(self, class_id: str) -> ClassRecord | None:
        with self._session() as db:
            row = db.get(orm.Class, class_id)
            return self._class_from_row(row) if row else None

    def list_courses(self) -> list[Course]:
        with self._session() as db:
            rows = db.scalars(select(orm.Course).order_by(orm.Course.level)).all()
            return [
                Course(
                    id=row.id,
                    name=row.name,
                    level=row.level,
                    description=row.description,
                    objectives=row.objectives,
                )
                for row in rows
            ]

    def create_class(
        self,
        *,
        course_id: str,
        location: str | None,
        starts_on: date | None,
        ends_on: date | None,
        schedule_note: str,
        start_time: time,
        end_time: time,
    ) -> ClassRecord | None:
        with self._session() as db:
            course = db.get(orm.Course, course_id)
            if course is None:
                return None
            course_label = f"{course.level} {course.name}".replace("-", " ")
            course_label = " ".join(course_label.split())
            period = "Morning" if start_time.hour < 12 else "Afternoon" if start_time.hour < 18 else "Evening"
            name = f"{course_label} {schedule_note} {period}"
            row = orm.Class(
                id=f"class-{uuid4()}",
                course_id=course.id,
                name=name,
                location=location,
                starts_on=starts_on,
                ends_on=ends_on,
                schedule_note=schedule_note,
                start_time=start_time,
                end_time=end_time,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return self._class_from_row(row)

    def get_teacher_names_by_class_ids(self, class_ids: list[str]) -> dict[str, list[str]]:
        if not class_ids:
            return {}
        with self._session() as db:
            rows = db.execute(
                select(orm.TeacherClassLink.class_id, orm.User.full_name)
                .join(orm.User, orm.User.id == orm.TeacherClassLink.teacher_user_id)
                .where(orm.TeacherClassLink.class_id.in_(class_ids))
                .order_by(orm.User.full_name)
            ).all()
        result: dict[str, list[str]] = {}
        for class_id, teacher_name in rows:
            result.setdefault(class_id, []).append(teacher_name)
        return result

    def delete_class(self, class_id: str) -> ClassRecord | None:
        with self._session() as db:
            row = db.get(orm.Class, class_id)
            if row is None:
                return None
            class_record = self._class_from_row(row)
            db.execute(update(orm.SkillScore).where(orm.SkillScore.class_id == class_id).values(class_id=None))
            db.delete(row)
            db.commit()
            return class_record

    def create_local_user(self, *, email: str, full_name: str, role: Role, password: str | None = None) -> UserRecord:
        with self._session() as db:
            if db.scalar(select(orm.User).where(orm.User.email == email.lower())):
                raise ValueError("A local user with this email already exists")
            user = orm.User(
                id=f"{role.value.lower()}-{uuid4()}",
                email=email.lower(),
                full_name=full_name,
                role=role.value,
                hashed_password=hash_password(password) if password else None,
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            return self._user_from_row(user)

    def create_teacher_profile(self, *, user: UserRecord, display_name: str | None = None) -> dict:
        with self._session() as db:
            teacher = orm.Teacher(id=f"teacher-profile-{uuid4()}", user_id=user.id, display_name=display_name or user.full_name, email=user.email)
            db.add(teacher)
            db.commit()
            return {"id": teacher.id, "user_id": teacher.user_id, "display_name": teacher.display_name, "email": teacher.email}

    def create_parent_profile(self, *, user: UserRecord, display_name: str | None = None, preferred_language: str = "vi") -> ParentProfile:
        with self._session() as db:
            parent = orm.Parent(
                id=f"parent-profile-{uuid4()}",
                user_id=user.id,
                display_name=display_name or user.full_name,
                email=user.email,
                preferred_language=preferred_language or "vi",
            )
            db.add(parent)
            db.commit()
            return ParentProfile(
                id=parent.id,
                user_id=parent.user_id,
                display_name=parent.display_name,
                email=parent.email,
                preferred_language=parent.preferred_language or "vi",
            )

    def create_student(
        self,
        *,
        full_name: str,
        level: str,
        parent_user_id: str,
        class_id: str | None = None,
        student_user_id: str | None = None,
    ) -> Student:
        return self.create_student_with_parent_link(
            full_name=full_name,
            level=level,
            parent_user_id=parent_user_id,
            class_id=class_id,
            student_user_id=student_user_id,
        )

    def create_student_with_parent_link(
        self,
        *,
        full_name: str,
        level: str,
        parent_user_id: str,
        class_id: str | None = None,
        student_user_id: str | None = None,
    ) -> Student:
        with self._session() as db:
            parent = db.get(orm.User, parent_user_id)
            if parent is None or parent.role != Role.parent.value:
                raise ValueError("Parent user not found")
            if class_id and db.get(orm.Class, class_id) is None:
                raise ValueError("Class not found")
            if student_user_id:
                student_user = db.get(orm.User, student_user_id)
                if student_user is None or student_user.role != Role.student.value:
                    raise ValueError("Student user not found")

            student = orm.Student(id=f"student-{uuid4()}", user_id=student_user_id, full_name=full_name, current_level=level)
            db.add(student)
            db.flush()
            db.add(
                orm.ParentStudentLink(
                    id=f"parent-student-{uuid4()}",
                    parent_user_id=parent_user_id,
                    student_id=student.id,
                )
            )
            if class_id:
                db.add(
                    orm.Enrollment(
                        id=f"enrollment-{uuid4()}",
                        student_id=student.id,
                        class_id=class_id,
                        enrolled_on=date.today(),
                        status="active",
                    )
                )
            db.commit()
            db.refresh(student)
            return self._student_from_row(db, student)

    def link_parent_to_student(self, *, parent_user_id: str, student_id: str) -> None:
        with self._session() as db:
            parent = db.get(orm.User, parent_user_id)
            if parent is None or parent.role != Role.parent.value:
                raise ValueError("Parent user not found")
            if db.get(orm.Student, student_id) is None:
                raise ValueError("Student not found")
            exists = db.scalar(select(orm.ParentStudentLink).where(orm.ParentStudentLink.parent_user_id == parent_user_id, orm.ParentStudentLink.student_id == student_id))
            if not exists:
                db.add(orm.ParentStudentLink(id=f"parent-student-{uuid4()}", parent_user_id=parent_user_id, student_id=student_id))
                db.commit()

    def assign_teacher_to_class(self, *, teacher_user_id: str, class_id: str) -> None:
        with self._session() as db:
            teacher = db.get(orm.User, teacher_user_id)
            if teacher is None or teacher.role != Role.teacher.value:
                raise ValueError("Teacher user not found")
            if db.get(orm.Class, class_id) is None:
                raise ValueError("Class not found")
            exists = db.scalar(select(orm.TeacherClassLink).where(orm.TeacherClassLink.teacher_user_id == teacher_user_id, orm.TeacherClassLink.class_id == class_id))
            if not exists:
                db.add(orm.TeacherClassLink(id=f"teacher-class-{uuid4()}", teacher_user_id=teacher_user_id, class_id=class_id))
                db.commit()

    def enroll_student_in_class(self, *, student_id: str, class_id: str) -> None:
        with self._session() as db:
            if db.get(orm.Student, student_id) is None:
                raise ValueError("Student not found")
            if db.get(orm.Class, class_id) is None:
                raise ValueError("Class not found")
            exists = db.scalar(select(orm.Enrollment).where(orm.Enrollment.student_id == student_id, orm.Enrollment.class_id == class_id))
            if not exists:
                db.add(orm.Enrollment(id=f"enrollment-{uuid4()}", student_id=student_id, class_id=class_id, enrolled_on=date.today(), status="active"))
                db.commit()

    def get_linked_students_for_parent(self, parent_id: str) -> list[Student]:
        with self._session() as db:
            links = db.scalars(select(orm.ParentStudentLink.student_id).where(orm.ParentStudentLink.parent_user_id == parent_id)).all()
            students = [db.get(orm.Student, sid) for sid in links]
            return [self._student_from_row(db, s) for s in students if s]

    def get_first_parent_user_id_for_student(self, student_id: str) -> str | None:
        with self._session() as db:
            return db.scalar(
                select(orm.ParentStudentLink.parent_user_id)
                .where(orm.ParentStudentLink.student_id == student_id)
                .order_by(orm.ParentStudentLink.id)
                .limit(1)
            )

    def get_parent_user_ids_for_student(self, student_id: str) -> list[str]:
        with self._session() as db:
            return list(
                db.scalars(
                    select(orm.ParentStudentLink.parent_user_id)
                    .where(orm.ParentStudentLink.student_id == student_id)
                    .order_by(orm.ParentStudentLink.id)
                ).all()
            )

    def get_primary_parent_language_for_student(self, student_id: str) -> str:
        with self._session() as db:
            parent = db.scalar(
                select(orm.Parent)
                .join(orm.ParentStudentLink, orm.ParentStudentLink.parent_user_id == orm.Parent.user_id)
                .where(orm.ParentStudentLink.student_id == student_id)
                .order_by(orm.ParentStudentLink.id)
            )
            return (parent.preferred_language if parent else None) or "vi"

    def get_assigned_class_ids_for_teacher(self, teacher_id: str) -> list[str]:
        with self._session() as db:
            return list(db.scalars(select(orm.TeacherClassLink.class_id).where(orm.TeacherClassLink.teacher_user_id == teacher_id)).all())

    def get_students_for_teacher(self, teacher_id: str) -> list[Student]:
        assigned = set(self.get_assigned_class_ids_for_teacher(teacher_id))
        return [student for student in self.list_students() if assigned.intersection(student.class_ids)]

    def get_classes_for_teacher(self, teacher_id: str) -> list[ClassRecord]:
        assigned = set(self.get_assigned_class_ids_for_teacher(teacher_id))
        return [class_record for class_record in self.list_classes() if class_record.id in assigned]

    def get_students_for_class(self, class_id: str) -> list[Student]:
        with self._session() as db:
            student_ids = db.scalars(
                select(orm.Enrollment.student_id).where(
                    orm.Enrollment.class_id == class_id,
                    orm.Enrollment.status == "active",
                )
            ).all()
            students = [db.get(orm.Student, student_id) for student_id in student_ids]
            return [self._student_from_row(db, student) for student in students if student]

    def get_class_schedule_for_student(self, student_id: str) -> list[dict]:
        with self._session() as db:
            rows = db.execute(
                select(orm.Class, orm.Course)
                .join(orm.Enrollment, orm.Enrollment.class_id == orm.Class.id)
                .join(orm.Course, orm.Course.id == orm.Class.course_id)
                .where(
                    orm.Enrollment.student_id == student_id,
                    orm.Enrollment.status == "active",
                )
                .order_by(orm.Class.starts_on, orm.Class.name)
            ).all()
            return [
                {
                    "class_id": class_row.id,
                    "class_name": class_row.name,
                    "course_id": course_row.id,
                    "course_name": course_row.name,
                    "course_level": course_row.level,
                    "course": f"{course_row.level} - {course_row.name}",
                    "schedule": class_row.schedule_note,
                    "location": class_row.location,
                    "starts_on": class_row.starts_on.isoformat() if class_row.starts_on else None,
                    "ends_on": class_row.ends_on.isoformat() if class_row.ends_on else None,
                }
                for class_row, course_row in rows
            ]

    def parent_can_access_student(self, parent_id: str, student_id: str) -> bool:
        with self._session() as db:
            return bool(db.scalar(select(orm.ParentStudentLink).where(orm.ParentStudentLink.parent_user_id == parent_id, orm.ParentStudentLink.student_id == student_id)))

    def teacher_can_access_class(self, teacher_id: str, class_id: str) -> bool:
        with self._session() as db:
            return bool(db.scalar(select(orm.TeacherClassLink).where(orm.TeacherClassLink.teacher_user_id == teacher_id, orm.TeacherClassLink.class_id == class_id)))

    def get_student(self, student_id: str) -> Student | None:
        with self._session() as db:
            row = db.get(orm.Student, student_id)
            return self._student_from_row(db, row) if row else None

    # def _score_from_row(self, row: orm.SkillScore) -> SkillScore:
    #     return SkillScore(id=row.id, student_id=row.student_id, class_id=row.class_id, skill=EnglishSkill(row.skill), score=row.score, scale=row.scale, assessed_on=row.assessed_on, source=row.source, teacher_id=row.teacher_id, teacher_comment=row.teacher_comment, trend_summary=row.trend_summary or {}, created_at=row.created_at, updated_at=row.updated_at)

    def get_score(self, score_id: str) -> SkillScore | None:
        with self._session() as db:
            row = db.get(orm.SkillScore, score_id)
            return self._score_from_row(row) if row else None

    def get_scores_for_student(self, student_id: str) -> list[SkillScore]:
        with self._session() as db:
            rows = db.scalars(
                select(orm.SkillScore)
                .where(orm.SkillScore.student_id == student_id, orm.SkillScore.source.like("assessment:%"))
                .order_by(orm.SkillScore.assessed_on.desc(), orm.SkillScore.created_at.desc())
            ).all()
            return [self._score_from_row(row) for row in rows]

    def get_class_skill_averages(self, class_id: str) -> dict[str, float | None]:
        skills = [skill.value for skill in EnglishSkill]
        student_skill_averages: dict[str, list[float]] = {skill: [] for skill in skills}
        for student in self.get_students_for_class(class_id):
            grouped: dict[str, list[float]] = {}
            for score in self.get_scores_for_student(student.id):
                if score.class_id != class_id:
                    continue
                grouped.setdefault(score.skill.value, []).append(score.score)
            for skill, values in grouped.items():
                if values:
                    student_skill_averages[skill].append(sum(values) / len(values))
        return {
            skill: round(sum(values) / len(values), 1) if values else None
            for skill, values in student_skill_averages.items()
        }

    # def create_score(
    #     self,
    #     *,
    #     student_id: str,
    #     class_id: str | None,
    #     skill: EnglishSkill,
    #     score: float,
    #     teacher_id: str | None,
    #     assessed_on: date,
    #     teacher_comment: str | None = None,
    # ) -> SkillScore:
    #     with self._session() as db:
    #         row = orm.SkillScore(
    #             id=f"score-{uuid4()}",
    #             student_id=student_id,
    #             class_id=class_id,
    #             skill=skill.value,
    #             score=score,
    #             scale="percent",
    #             assessed_on=assessed_on,
    #             source="teacher checkpoint",
    #             teacher_id=teacher_id,
    #             teacher_comment=teacher_comment,
    #         )

    def get_score_trend_for_student(self, student_id: str, window_size: int = 2) -> dict:
        scores = self.get_scores_for_student(student_id)
        by_skill: dict[str, list[SkillScore]] = {}
        for score in scores:
            by_skill.setdefault(score.skill.value, []).append(score)
        return {
            "student_id": student_id,
            "skills": {
                skill: items[0].trend_summary or self._score_trend_for_skill(items, window_size)
                for skill, items in by_skill.items()
            },
        }

    def _score_trend_for_skill(self, scores: list[SkillScore], window_size: int) -> dict:
        latest = scores[0]
        previous = scores[1] if len(scores) > 1 else None
        point_change = round(latest.score - previous.score, 2) if previous else None
        recent_window = scores[:window_size]
        previous_window = scores[window_size : window_size * 2]
        recent_avg = round(sum(score.score for score in recent_window) / len(recent_window), 2) if recent_window else None
        if previous_window:
            previous_avg = round(sum(score.score for score in previous_window) / len(previous_window), 2)
        else:
            previous_avg = round(previous.score, 2) if previous else None
        window_change = round(recent_avg - previous_avg, 2) if recent_avg is not None and previous_avg is not None else None
        return {
            "latest_score": round(latest.score, 2),
            "previous_score": round(previous.score, 2) if previous else None,
            "change": point_change,
            "trend": _score_trend_label(point_change),
            "latest_assessed_on": latest.assessed_on.isoformat(),
            "previous_assessed_on": previous.assessed_on.isoformat() if previous else None,
            "window_trend": {
                "previous_avg": previous_avg,
                "recent_avg": recent_avg,
                "change": window_change,
                "trend": _score_trend_label(window_change),
            },
        }

    def sync_skill_scores_from_assessment(self, *, student_id: str, assessment_id: str, teacher_id: str | None) -> list[SkillScore]:
        with self._session() as db:
            assessment = db.get(orm.Assessment, assessment_id)
            if assessment is None:
                return []
            rows = db.execute(
                select(orm.AssessmentQuestion, orm.StudentAnswer)
                .join(orm.StudentAnswer, orm.StudentAnswer.assessment_question_id == orm.AssessmentQuestion.id)
                .where(
                    orm.AssessmentQuestion.assessment_id == assessment_id,
                    orm.StudentAnswer.student_id == student_id,
                )
            ).all()
            by_skill: dict[str, dict[str, float]] = {}
            for question, answer in rows:
                if answer.score_awarded is None:
                    continue
                item = by_skill.setdefault(question.skill_tag, {"score": 0.0, "max_score": 0.0})
                item["score"] += answer.score_awarded
                item["max_score"] += question.max_score

            synced_rows: list[orm.SkillScore] = []
            now = datetime.now(UTC)
            assessed_on = assessment.assessment_date or now.date()
            source = f"assessment:{assessment_id}"
            for skill, values in by_skill.items():
                if values["max_score"] <= 0:
                    continue
                percent = round(values["score"] / values["max_score"] * 100, 2)
                row = db.scalar(
                    select(orm.SkillScore).where(
                        orm.SkillScore.student_id == student_id,
                        orm.SkillScore.class_id == assessment.class_id,
                        orm.SkillScore.skill == skill,
                        orm.SkillScore.source == source,
                    )
                )
                if row is None:
                    row = orm.SkillScore(
                        id=f"score-{uuid4()}",
                        student_id=student_id,
                        class_id=assessment.class_id,
                        skill=skill,
                        score=percent,
                        scale="percent",
                        assessed_on=assessed_on,
                        source=source,
                        teacher_id=teacher_id,
                        teacher_comment=f"Từ bài kiểm tra: {assessment.title}",
                        trend_summary={},
                        created_at=now,
                        updated_at=now,
                    )
                    db.add(row)
                else:
                    row.score = percent
                    row.assessed_on = assessed_on
                    row.teacher_id = teacher_id
                    row.teacher_comment = f"Từ bài kiểm tra: {assessment.title}"
                    row.updated_at = now
                synced_rows.append(row)
            db.flush()
            for row in synced_rows:
                skill_rows = db.scalars(
                    select(orm.SkillScore)
                    .where(
                        orm.SkillScore.student_id == student_id,
                        orm.SkillScore.skill == row.skill,
                        orm.SkillScore.source.like("assessment:%"),
                    )
                    .order_by(orm.SkillScore.assessed_on.desc(), orm.SkillScore.created_at.desc())
                ).all()
                row.trend_summary = self._score_trend_for_skill([self._score_from_row(skill_row) for skill_row in skill_rows], window_size=2)
            self._mark_ai_insight_type_stale(db, student_id, "assessment_progress", assessment_id)
            db.commit()
            return [self._score_from_row(row) for row in synced_rows]

    def create_score(self, *, student_id: str, class_id: str, skill: EnglishSkill, score: float, teacher_id: str, assessed_on: date, teacher_comment: str | None) -> SkillScore:
        with self._session() as db:
            now = datetime.now(UTC)
            row = orm.SkillScore(id=f"score-{uuid4()}", student_id=student_id, class_id=class_id, skill=skill.value, score=score, assessed_on=assessed_on, source="teacher gradebook", teacher_id=teacher_id, teacher_comment=teacher_comment, trend_summary={}, created_at=now, updated_at=now)
            db.add(row)
            db.commit()
            db.refresh(row)
            return self._score_from_row(row)

    def update_score(
        self,
        score_id: str,
        *,
        score: float | None = None,
        assessed_on: date | None = None,
        teacher_comment: str | None = None,
    ) -> SkillScore | None:
        with self._session() as db:
            row = db.get(orm.SkillScore, score_id)
            if row is None:
                return None
            if score is not None:
                row.score = score
            if assessed_on is not None:
                row.assessed_on = assessed_on
            if teacher_comment is not None:
                row.teacher_comment = teacher_comment
            row.updated_at = datetime.now(UTC)
            db.commit()
            db.refresh(row)
            return self._score_from_row(row)

    def _mark_ai_insight_stale(self, db: Session, student_id: str) -> None:
        db.execute(update(orm.AiInsight).where(orm.AiInsight.student_id == student_id).values(is_stale=True, stale_reason="Student data changed"))

    def _mark_ai_insight_type_stale(self, db: Session, student_id: str, insight_type: str, assessment_id: str | None = None) -> None:
        conditions = [orm.AiInsight.student_id == student_id, orm.AiInsight.insight_type == insight_type, orm.AiInsight.is_stale.is_(False)]
        if assessment_id is None:
            conditions.append(orm.AiInsight.assessment_id.is_(None))
        else:
            conditions.append(orm.AiInsight.assessment_id == assessment_id)
        db.execute(update(orm.AiInsight).where(*conditions).values(is_stale=True, stale_reason="Newer insight generated"))

    def mark_ai_insight_stale(self, student_id: str) -> None:
        with self._session() as db:
            self._mark_ai_insight_stale(db, student_id)
            db.commit()

    def create_zalo_link_session(self, *, student_id: str, created_by_user_id: str | None, session_token: str, expires_at: datetime) -> ZaloLinkSession:
        with self._session() as db:
            now = datetime.now(UTC)
            row = orm.ZaloLinkSession(
                id=f"zalo-session-{uuid4()}",
                student_id=student_id,
                created_by_user_id=created_by_user_id,
                session_token=session_token,
                status="pending",
                otp_code=self._generate_zalo_link_otp(),
                otp_expires_at=expires_at,
                otp_attempt_count=0,
                expires_at=expires_at,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return self._zalo_session_from_row(row)

    def get_zalo_link_session(self, session_id: str) -> ZaloLinkSession | None:
        with self._session() as db:
            row = db.get(orm.ZaloLinkSession, session_id)
            return self._zalo_session_from_row(row) if row else None

    def get_zalo_link_session_by_token(self, session_token: str) -> ZaloLinkSession | None:
        with self._session() as db:
            row = db.scalar(select(orm.ZaloLinkSession).where(orm.ZaloLinkSession.session_token == session_token))
            return self._zalo_session_from_row(row) if row else None

    def get_active_zalo_link_session_for_student(self, student_id: str) -> ZaloLinkSession | None:
        with self._session() as db:
            row = db.scalar(
                select(orm.ZaloLinkSession)
                .where(
                    orm.ZaloLinkSession.student_id == student_id,
                    orm.ZaloLinkSession.status.in_(["pending", "link_ready"]),
                    orm.ZaloLinkSession.expires_at > datetime.now(UTC),
                )
                .order_by(orm.ZaloLinkSession.created_at.desc())
                .limit(1)
            )
            return self._zalo_session_from_row(row) if row else None

    def get_zalo_link_session_by_otp(self, otp_code: str) -> ZaloLinkSession | None:
        with self._session() as db:
            row = db.scalar(
                select(orm.ZaloLinkSession)
                .where(
                    orm.ZaloLinkSession.otp_code == otp_code,
                    orm.ZaloLinkSession.status.in_(["pending", "link_ready"]),
                )
                .order_by(orm.ZaloLinkSession.created_at.desc())
                .limit(1)
            )
            return self._zalo_session_from_row(row) if row else None

    def update_zalo_link_session(self, session_id: str, **changes) -> ZaloLinkSession | None:
        with self._session() as db:
            row = db.get(orm.ZaloLinkSession, session_id)
            if row is None:
                return None
            for key, value in changes.items():
                if hasattr(row, key):
                    setattr(row, key, value)
            row.updated_at = datetime.now(UTC)
            db.commit()
            db.refresh(row)
            return self._zalo_session_from_row(row)

    def increment_zalo_link_session_otp_attempts(self, session_id: str) -> ZaloLinkSession | None:
        with self._session() as db:
            row = db.get(orm.ZaloLinkSession, session_id)
            if row is None:
                return None
            row.otp_attempt_count = (row.otp_attempt_count or 0) + 1
            row.updated_at = datetime.now(UTC)
            db.commit()
            db.refresh(row)
            return self._zalo_session_from_row(row)

    def create_or_update_student_channel_link(
        self,
        *,
        student_id: str,
        sender_id: str,
        zalo_display_name: str | None = None,
        linked_by_user_id: str | None = None,
        linked_via_session_id: str | None = None,
    ) -> StudentChannelLink:
        with self._session() as db:
            row = db.scalar(
                select(orm.StudentChannelLink).where(
                    orm.StudentChannelLink.student_id == student_id,
                    orm.StudentChannelLink.channel == "zalo",
                    orm.StudentChannelLink.sender_id == sender_id,
                )
            )
            now = datetime.now(UTC)
            if row is None:
                row = orm.StudentChannelLink(
                    id=f"zalo-link-{uuid4()}",
                    student_id=student_id,
                    channel="zalo",
                    sender_id=sender_id,
                    zalo_display_name=zalo_display_name,
                    linked_by_user_id=linked_by_user_id,
                    linked_via_session_id=linked_via_session_id,
                    status="active",
                    created_at=now,
                    updated_at=now,
                )
                db.add(row)
            else:
                row.zalo_display_name = zalo_display_name or row.zalo_display_name
                row.linked_by_user_id = linked_by_user_id or row.linked_by_user_id
                row.linked_via_session_id = linked_via_session_id or row.linked_via_session_id
                row.status = "active"
                row.updated_at = now
            db.commit()
            db.refresh(row)
            return self._channel_link_from_row(row)

    def get_channel_links_for_student(self, student_id: str, channel: str | None = None) -> list[StudentChannelLink]:
        with self._session() as db:
            query = select(orm.StudentChannelLink).where(orm.StudentChannelLink.student_id == student_id)
            if channel:
                query = query.where(orm.StudentChannelLink.channel == channel)
            rows = db.scalars(query.order_by(orm.StudentChannelLink.created_at.desc())).all()
            return [self._channel_link_from_row(row) for row in rows]

    def get_active_channel_links_for_student(self, student_id: str, channel: str = "zalo") -> list[StudentChannelLink]:
        return [link for link in self.get_channel_links_for_student(student_id, channel) if link.status == "active"]

    def create_zalo_message(
        self,
        *,
        sender_id: str,
        direction: str,
        content: str,
        student_id: str | None = None,
        channel_link_id: str | None = None,
        zalo_display_name: str | None = None,
        raw_message_id: str | None = None,
        sent_at: datetime | None = None,
    ) -> ZaloMessage:
        with self._session() as db:
            now = datetime.now(UTC)
            resolved_student_id = student_id
            resolved_link_id = channel_link_id
            if resolved_student_id is None or resolved_link_id is None:
                link_row = db.scalar(
                    select(orm.StudentChannelLink).where(
                        orm.StudentChannelLink.channel == "zalo",
                        orm.StudentChannelLink.sender_id == sender_id,
                    )
                )
                if link_row is not None:
                    resolved_student_id = resolved_student_id or link_row.student_id
                    resolved_link_id = resolved_link_id or link_row.id
                    link_row.last_message_at = sent_at or now
                    link_row.updated_at = now
                    if zalo_display_name and not link_row.zalo_display_name:
                        link_row.zalo_display_name = zalo_display_name

            row = orm.ZaloMessage(
                id=f"zalo-message-{uuid4()}",
                student_id=resolved_student_id,
                channel_link_id=resolved_link_id,
                sender_id=sender_id,
                zalo_display_name=zalo_display_name,
                direction=direction,
                content=content,
                raw_message_id=raw_message_id,
                sent_at=sent_at or now,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return self._zalo_message_from_row(row)

    def list_zalo_chat_threads(self) -> list[dict]:
        with self._session() as db:
            link_rows = db.scalars(
                select(orm.StudentChannelLink)
                .where(orm.StudentChannelLink.channel == "zalo")
                .order_by(orm.StudentChannelLink.last_message_at.desc().nullslast(), orm.StudentChannelLink.created_at.desc())
            ).all()

            threads: list[dict] = []
            seen_keys: set[tuple[str | None, str]] = set()
            for link in link_rows:
                key = (link.student_id, link.sender_id)
                seen_keys.add(key)
                student = db.get(orm.Student, link.student_id) if link.student_id else None
                last_message = db.scalar(
                    select(orm.ZaloMessage)
                    .where(orm.ZaloMessage.sender_id == link.sender_id)
                    .order_by(orm.ZaloMessage.sent_at.desc())
                    .limit(1)
                )
                count_rows = db.scalars(
                    select(orm.ZaloMessage.id).where(orm.ZaloMessage.sender_id == link.sender_id)
                ).all()
                threads.append(
                    {
                        "student_id": link.student_id,
                        "student_name": student.full_name if student else None,
                        "student_level": student.current_level if student else None,
                        "sender_id": link.sender_id,
                        "zalo_display_name": link.zalo_display_name,
                        "channel_link_id": link.id,
                        "link_status": link.status,
                        "last_message_at": (last_message.sent_at if last_message else link.last_message_at),
                        "last_message_preview": (last_message.content[:160] if last_message else None),
                        "last_message_direction": (last_message.direction if last_message else None),
                        "message_count": len(count_rows),
                    }
                )

            unlinked_senders = db.execute(
                select(
                    orm.ZaloMessage.sender_id,
                    orm.ZaloMessage.zalo_display_name,
                ).where(orm.ZaloMessage.student_id.is_(None)).distinct()
            ).all()
            for sender_id, display_name in unlinked_senders:
                if (None, sender_id) in seen_keys:
                    continue
                last_message = db.scalar(
                    select(orm.ZaloMessage)
                    .where(orm.ZaloMessage.sender_id == sender_id, orm.ZaloMessage.student_id.is_(None))
                    .order_by(orm.ZaloMessage.sent_at.desc())
                    .limit(1)
                )
                count_rows = db.scalars(
                    select(orm.ZaloMessage.id).where(
                        orm.ZaloMessage.sender_id == sender_id,
                        orm.ZaloMessage.student_id.is_(None),
                    )
                ).all()
                threads.append(
                    {
                        "student_id": None,
                        "student_name": None,
                        "student_level": None,
                        "sender_id": sender_id,
                        "zalo_display_name": display_name,
                        "channel_link_id": None,
                        "link_status": "unlinked",
                        "last_message_at": last_message.sent_at if last_message else None,
                        "last_message_preview": last_message.content[:160] if last_message else None,
                        "last_message_direction": last_message.direction if last_message else None,
                        "message_count": len(count_rows),
                    }
                )

            threads.sort(key=lambda item: (item["last_message_at"] or datetime.min.replace(tzinfo=UTC)), reverse=True)
            return threads

    def get_zalo_messages_for_thread(
        self,
        *,
        student_id: str | None,
        sender_id: str,
        limit: int = 200,
    ) -> list[ZaloMessage]:
        with self._session() as db:
            query = select(orm.ZaloMessage).where(orm.ZaloMessage.sender_id == sender_id)
            if student_id is None:
                query = query.where(orm.ZaloMessage.student_id.is_(None))
            else:
                query = query.where(orm.ZaloMessage.student_id == student_id)
            rows = db.scalars(query.order_by(orm.ZaloMessage.sent_at.asc()).limit(limit)).all()
            return [self._zalo_message_from_row(row) for row in rows]

    def get_zalo_bot_session(self, account_label: str) -> ZaloBotSession | None:
        with self._session() as db:
            row = db.scalar(select(orm.ZaloBotSession).where(orm.ZaloBotSession.account_label == account_label))
            return self._zalo_bot_session_from_row(row) if row else None

    _UNSET = object()

    def upsert_zalo_bot_session(
        self,
        *,
        account_label: str,
        adapter: str,
        status: str,
        encrypted_session_payload: str | None | object = _UNSET,
        bot_chat_url: str | None | object = _UNSET,
        bot_display_name: str | None | object = _UNSET,
        last_login_at: datetime | None = None,
        last_error: str | None = None,
    ) -> ZaloBotSession:
        with self._session() as db:
            row = db.scalar(select(orm.ZaloBotSession).where(orm.ZaloBotSession.account_label == account_label))
            now = datetime.now(UTC)
            if row is None:
                row = orm.ZaloBotSession(
                    id=f"zalo-bot-session-{uuid4()}",
                    account_label=account_label,
                    adapter=adapter,
                    status=status,
                    encrypted_session_payload=None if encrypted_session_payload is self._UNSET else encrypted_session_payload,
                    bot_chat_url=None if bot_chat_url is self._UNSET else bot_chat_url,
                    bot_display_name=None if bot_display_name is self._UNSET else bot_display_name,
                    last_login_at=last_login_at,
                    last_error=last_error,
                    created_at=now,
                    updated_at=now,
                )
                db.add(row)
            else:
                row.adapter = adapter
                row.status = status
                if encrypted_session_payload is not self._UNSET:
                    row.encrypted_session_payload = encrypted_session_payload
                if bot_chat_url is not self._UNSET:
                    row.bot_chat_url = bot_chat_url
                if bot_display_name is not self._UNSET:
                    row.bot_display_name = bot_display_name
                row.last_login_at = last_login_at or row.last_login_at
                row.last_error = last_error
                row.updated_at = now
            db.commit()
            db.refresh(row)
            return self._zalo_bot_session_from_row(row)

    def get_student_id_for_zalo_sender(self, sender_id: str) -> str | None:
        with self._session() as db:
            row = db.scalar(
                select(orm.StudentChannelLink)
                .where(
                    orm.StudentChannelLink.channel == "zalo",
                    orm.StudentChannelLink.sender_id == sender_id,
                    orm.StudentChannelLink.status == "active",
                )
                .order_by(orm.StudentChannelLink.updated_at.desc())
                .limit(1)
            )
            return row.student_id if row else None

    def get_active_channel_link_for_sender(self, sender_id: str) -> StudentChannelLink | None:
        with self._session() as db:
            row = db.scalar(
                select(orm.StudentChannelLink)
                .where(
                    orm.StudentChannelLink.channel == "zalo",
                    orm.StudentChannelLink.sender_id == sender_id,
                    orm.StudentChannelLink.status == "active",
                )
                .order_by(orm.StudentChannelLink.updated_at.desc())
                .limit(1)
            )
            return self._channel_link_from_row(row) if row else None

    def is_ai_insight_stale(self, student_id: str) -> bool:
        with self._session() as db:
            row = db.scalar(select(orm.AiInsight).where(orm.AiInsight.student_id == student_id, orm.AiInsight.is_stale.is_(True)))
            return bool(row)

    def _ai_insight_from_row(self, row: orm.AiInsight) -> AiInsight:
        return AiInsight(
            id=row.id,
            user_id=row.user_id,
            student_id=row.student_id,
            assessment_id=row.assessment_id,
            insight_type=row.insight_type,
            content=row.content,
            retrieved_context=row.retrieved_context,
            safety_notes=row.safety_notes,
            is_stale=row.is_stale,
            stale_reason=row.stale_reason,
        )

    def create_ai_insight(
        self,
        *,
        student_id: str,
        insight_type: str,
        content: str,
        retrieved_context: list[dict],
        safety_notes: list[str],
        user_id: str | None = None,
        assessment_id: str | None = None,
        is_stale: bool = False,
        stale_reason: str | None = None,
        stale_existing: bool = True,
    ) -> AiInsight:
        with self._session() as db:
            if stale_existing:
                self._mark_ai_insight_type_stale(db, student_id, insight_type, assessment_id)
            row = orm.AiInsight(
                id=f"insight-{uuid4()}",
                user_id=user_id,
                student_id=student_id,
                assessment_id=assessment_id,
                insight_type=insight_type,
                content=content,
                retrieved_context=retrieved_context,
                safety_notes=safety_notes,
                is_stale=is_stale,
                stale_reason=stale_reason,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return self._ai_insight_from_row(row)

    def get_ai_insights_for_student(self, student_id: str, insight_type: str | None = None, include_stale: bool = False) -> list[AiInsight]:
        with self._session() as db:
            conditions = [orm.AiInsight.student_id == student_id]
            if insight_type:
                conditions.append(orm.AiInsight.insight_type == insight_type)
            if not include_stale:
                conditions.append(orm.AiInsight.is_stale.is_(False))
            rows = db.scalars(
                select(orm.AiInsight)
                .outerjoin(orm.Assessment, orm.Assessment.id == orm.AiInsight.assessment_id)
                .where(*conditions)
                .order_by(orm.Assessment.assessment_date.desc().nullslast(), orm.Assessment.created_at.desc().nullslast(), orm.AiInsight.id.desc())
            ).all()
            return [self._ai_insight_from_row(row) for row in rows]

    @property
    def audit_entries(self) -> list[dict]:
        with self._session() as db:
            rows = db.scalars(select(orm.AuditLog).order_by(orm.AuditLog.created_at)).all()
            return [{"id": r.id, "actor_id": r.actor_user_id, "actor_role": r.actor_role, "action": r.action, "resource_type": r.resource_type, "resource_id": r.resource_id, "metadata": r.meta, "created_at": r.created_at.isoformat()} for r in rows]

    @property
    def answer_analyses(self) -> dict[str, dict]:
        with self._session() as db:
            rows = db.scalars(select(orm.AnswerAnalysis)).all()
            return {r.student_answer_id: {"id": r.id, "student_answer_id": r.student_answer_id} for r in rows}

    def create_audit_log(self, *, actor_id: str, actor_role: Role, action: str, resource_type: str, resource_id: str, metadata: dict | None = None) -> dict:
        with self._session() as db:
            row = orm.AuditLog(id=f"audit-{uuid4()}", actor_user_id=actor_id, actor_role=actor_role.value, action=action, resource_type=resource_type, resource_id=resource_id, meta=metadata or {})
            db.add(row)
            db.commit()
            return {"id": row.id, "actor_id": actor_id, "actor_role": actor_role, "action": action, "resource_type": resource_type, "resource_id": resource_id, "metadata": metadata or {}, "created_at": row.created_at.isoformat()}

    def get_progress_snapshot(self, student_id: str) -> dict:
        scores = self.get_scores_for_student(student_id)
        grouped_scores: dict[str, list[SkillScore]] = {}
        for score in scores:
            grouped_scores.setdefault(score.skill.value, []).append(score)
        skill_summary = {
            skill: {
                "average": round(sum(item.score for item in items) / len(items), 1),
                "latest": round(items[0].score, 1),
            }
            for skill, items in grouped_scores.items()
        }
        avg = round(sum(item["average"] for item in skill_summary.values()) / len(skill_summary), 1) if skill_summary else 0
        with self._session() as db:
            course_name = db.scalar(
                select(orm.Course.name)
                .join(orm.Class, orm.Class.course_id == orm.Course.id)
                .join(orm.Enrollment, orm.Enrollment.class_id == orm.Class.id)
                .where(orm.Enrollment.student_id == student_id)
                .order_by(orm.Enrollment.enrolled_on.desc())
                .limit(1)
            )
            attendance_rows = db.scalars(
                select(orm.AttendanceRecord).where(orm.AttendanceRecord.student_id == student_id)
            ).all()
        attendance_total = len(attendance_rows)
        attendance_present = sum(1 for row in attendance_rows if row.status == "present")
        attendance_rate = round(attendance_present / attendance_total, 4) if attendance_total else 0
        return {"student_id": student_id, "course": course_name or "Chưa có khóa học", "recent_average": avg, "skills": skill_summary, "attendance_rate": attendance_rate}

    def get_attendance(self, student_id: str) -> list[AttendanceRecord]:
        with self._session() as db:
            rows = db.scalars(
                select(orm.AttendanceRecord)
                .where(orm.AttendanceRecord.student_id == student_id)
                .order_by(orm.AttendanceRecord.class_date.desc())
            ).all()
            return [AttendanceRecord(id=r.id, student_id=r.student_id, class_id=r.class_id, class_date=r.class_date, status=r.status, note=r.note) for r in rows]

    def get_attendance_dates_for_class(self, class_id: str, *, start: date | None = None, end: date | None = None) -> list[date]:
        with self._session() as db:
            class_row = db.get(orm.Class, class_id)
            if class_row is None:
                return []
            today = date.today()
            if start is not None:
                range_start = start
            elif class_row.starts_on and class_row.starts_on > today:
                range_start = class_row.starts_on
            else:
                range_start = today
            if end is not None:
                range_end = end
            elif class_row.ends_on and class_row.ends_on >= range_start:
                range_end = class_row.ends_on
            else:
                range_end = range_start + timedelta(days=45)
            weekdays = _weekdays_from_schedule_note(class_row.schedule_note)
            if not weekdays:
                return []
            current = range_start
            dates = []
            while current <= range_end:
                if current.weekday() in weekdays:
                    dates.append(current)
                current = date.fromordinal(current.toordinal() + 1)
            return dates

    def get_attendance_session_for_class(self, class_id: str, class_date: date) -> dict:
        with self._session() as db:
            students = db.scalars(
                select(orm.Student)
                .join(orm.Enrollment, orm.Enrollment.student_id == orm.Student.id)
                .where(orm.Enrollment.class_id == class_id, orm.Enrollment.status == "active")
                .order_by(orm.Student.full_name)
            ).all()
            attendance_rows = db.scalars(
                select(orm.AttendanceRecord).where(orm.AttendanceRecord.class_id == class_id, orm.AttendanceRecord.class_date == class_date)
            ).all()
            attendance_by_student = {row.student_id: row for row in attendance_rows}
            return {
                "class_id": class_id,
                "class_date": class_date,
                "students": [
                    {
                        "student_id": student.id,
                        "full_name": student.full_name,
                        "level": student.current_level,
                        "status": attendance_by_student.get(student.id).status if attendance_by_student.get(student.id) else "absent",
                        "note": attendance_by_student.get(student.id).note if attendance_by_student.get(student.id) else None,
                    }
                    for student in students
                ],
            }

    def upsert_attendance_for_class(self, *, class_id: str, class_date: date, records: list[dict]) -> dict:
        with self._session() as db:
            enrolled_student_ids = set(
                db.scalars(
                    select(orm.Enrollment.student_id).where(orm.Enrollment.class_id == class_id, orm.Enrollment.status == "active")
                ).all()
            )
            for record in records:
                student_id = record["student_id"]
                if student_id not in enrolled_student_ids:
                    raise ValueError(f"Student {student_id} is not enrolled in this class")
                row = db.scalar(
                    select(orm.AttendanceRecord).where(
                        orm.AttendanceRecord.class_id == class_id,
                        orm.AttendanceRecord.student_id == student_id,
                        orm.AttendanceRecord.class_date == class_date,
                    )
                )
                if row is None:
                    row = orm.AttendanceRecord(
                        id=f"attendance-{uuid4()}",
                        student_id=student_id,
                        class_id=class_id,
                        class_date=class_date,
                        status=record["status"],
                        note=record.get("note"),
                    )
                    db.add(row)
                else:
                    row.status = record["status"]
                    row.note = record.get("note")
            db.commit()
        return self.get_attendance_session_for_class(class_id, class_date)

    def get_teacher_dashboard_overview(self, teacher_id: str, *, start: date, days: int) -> dict:
        from app.services.alerts import get_teacher_dashboard_alerts

        classes = self.get_classes_for_teacher(teacher_id)
        schedule_days = []
        stats_by_class: dict[str, dict] = {}
        end = start + timedelta(days=days - 1)
        actions_by_session = self.get_sent_class_actions_for_sessions(
            [class_record.id for class_record in classes],
            start=start,
            end=end,
        )

        for class_record in classes:
            students = self.get_students_for_class(class_record.id)
            assessments = self.get_assessments_for_class(class_record.id)
            stats_by_class[class_record.id] = {"students": students, "assessments": assessments}

        for offset in range(days):
            current = start + timedelta(days=offset)
            day_classes = []
            for class_record in classes:
                weekdays = _weekdays_from_schedule_note(class_record.schedule_note)
                if current.weekday() not in weekdays:
                    continue
                if class_record.starts_on and current < class_record.starts_on:
                    continue
                if class_record.ends_on and current > class_record.ends_on:
                    continue
                stats = stats_by_class[class_record.id]
                day_classes.append(
                    {
                        "class_id": class_record.id,
                        "class_name": class_record.name,
                        "schedule_note": class_record.schedule_note,
                        "location": class_record.location,
                        "student_count": len(stats["students"]),
                        "assessment_count": len(stats["assessments"]),
                        "actions": actions_by_session.get((class_record.id, current), []),
                    }
                )
            schedule_days.append({"date": current, "weekday_label": _weekday_label_vi(current), "classes": day_classes})

        return {
            "start": start,
            "days": days,
            "schedule_days": schedule_days,
            "alerts": get_teacher_dashboard_alerts(teacher_id=teacher_id),
            "pending_assessment_reviews": self.get_pending_assessment_reviews_for_teacher(teacher_id),
        }

    def get_pending_assessment_reviews_for_teacher(self, teacher_id: str) -> list[dict]:
        assigned_class_ids = set(self.get_assigned_class_ids_for_teacher(teacher_id))
        if not assigned_class_ids:
            return []
        pending_by_assessment: dict[str, dict] = {}
        with self._session() as db:
            class_names = dict(
                db.execute(
                    select(orm.Class.id, orm.Class.name).where(
                        orm.Class.id.in_(assigned_class_ids)
                    )
                ).all()
            )
            rows = db.execute(
                select(orm.Assessment, orm.StudentAnswer.student_id, orm.StudentAnswer.submitted_at)
                .join(orm.AssessmentQuestion, orm.AssessmentQuestion.assessment_id == orm.Assessment.id)
                .join(orm.StudentAnswer, orm.StudentAnswer.assessment_question_id == orm.AssessmentQuestion.id)
                .where(orm.Assessment.class_id.in_(assigned_class_ids))
                .order_by(orm.StudentAnswer.submitted_at.desc())
            ).all()
            for assessment, student_id, submitted_at in rows:
                finalized = db.scalar(
                    select(orm.SkillScore.id)
                    .where(
                        orm.SkillScore.student_id == student_id,
                        orm.SkillScore.class_id == assessment.class_id,
                        orm.SkillScore.source == f"assessment:{assessment.id}",
                    )
                    .limit(1)
                )
                if finalized:
                    continue
                item = pending_by_assessment.setdefault(
                    assessment.id,
                    {
                        "assessment_id": assessment.id,
                        "class_id": assessment.class_id,
                        "class_name": class_names.get(assessment.class_id, "Lớp học"),
                        "title": assessment.title,
                        "student_ids": set(),
                        "latest_submitted_at": submitted_at,
                    },
                )
                item["student_ids"].add(student_id)
                if submitted_at > item["latest_submitted_at"]:
                    item["latest_submitted_at"] = submitted_at
        pending = [
            {
                "assessment_id": item["assessment_id"],
                "class_id": item["class_id"],
                "class_name": item["class_name"],
                "title": item["title"],
                "submitted_count": len(item["student_ids"]),
                "latest_submitted_at": item["latest_submitted_at"],
            }
            for item in pending_by_assessment.values()
        ]
        return sorted(pending, key=lambda item: item["latest_submitted_at"], reverse=True)

    def create_teacher_class_action_draft(self, *, class_id: str, teacher_id: str, action_type: str, content: str, scheduled_for: date) -> dict:
        with self._session() as db:
            row = orm.TeacherClassActionDraft(
                id=f"class-action-{uuid4()}",
                class_id=class_id,
                teacher_user_id=teacher_id,
                action_type=action_type,
                content=content,
                scheduled_for=scheduled_for,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return {
                "id": row.id,
                "class_id": row.class_id,
                "teacher_user_id": row.teacher_user_id,
                "action_type": row.action_type,
                "content": row.content,
                "scheduled_for": row.scheduled_for,
                "status": row.status,
                "sent_at": row.sent_at,
                "sent_by_user_id": row.sent_by_user_id,
                "created_at": row.created_at,
            }

    def get_teacher_class_action_draft(self, draft_id: str) -> dict | None:
        with self._session() as db:
            row = db.get(orm.TeacherClassActionDraft, draft_id)
            if row is None:
                return None
            return {
                "id": row.id,
                "class_id": row.class_id,
                "teacher_user_id": row.teacher_user_id,
                "action_type": row.action_type,
                "content": row.content,
                "scheduled_for": row.scheduled_for,
                "status": row.status,
                "sent_at": row.sent_at,
                "sent_by_user_id": row.sent_by_user_id,
                "created_at": row.created_at,
            }

    def get_sent_class_actions_for_sessions(self, class_ids: list[str], *, start: date, end: date) -> dict[tuple[str, date], list[dict]]:
        if not class_ids:
            return {}
        with self._session() as db:
            rows = db.execute(
                select(orm.TeacherClassActionDraft)
                .where(
                    orm.TeacherClassActionDraft.class_id.in_(class_ids),
                    orm.TeacherClassActionDraft.status == "sent",
                    orm.TeacherClassActionDraft.scheduled_for >= start,
                    orm.TeacherClassActionDraft.scheduled_for <= end,
                )
                .order_by(orm.TeacherClassActionDraft.sent_at.desc(), orm.TeacherClassActionDraft.created_at.desc())
            ).scalars().all()
        actions_by_session: dict[tuple[str, date], list[dict]] = {}
        for row in rows:
            if row.scheduled_for is None:
                continue
            actions_by_session.setdefault((row.class_id, row.scheduled_for), []).append(
                {
                    "id": row.id,
                    "action_type": row.action_type,
                    "content": row.content,
                    "scheduled_for": row.scheduled_for,
                    "status": row.status,
                    "sent_at": row.sent_at,
                }
            )
        return actions_by_session

    def mark_teacher_class_action_draft_sent(self, draft_id: str, teacher_id: str) -> dict | None:
        with self._session() as db:
            row = db.get(orm.TeacherClassActionDraft, draft_id)
            if row is None:
                return None
            row.status = "sent"
            row.sent_at = datetime.now(UTC)
            row.sent_by_user_id = teacher_id
            db.commit()
            db.refresh(row)
            return {
                "id": row.id,
                "class_id": row.class_id,
                "teacher_user_id": row.teacher_user_id,
                "action_type": row.action_type,
                "content": row.content,
                "scheduled_for": row.scheduled_for,
                "status": row.status,
                "sent_at": row.sent_at,
                "sent_by_user_id": row.sent_by_user_id,
                "created_at": row.created_at,
            }

    def create_student_alert_event_if_new(
        self,
        *,
        student_id: str,
        class_id: str | None,
        assessment_id: str | None,
        reason: str,
        reason_label: str,
        metric_value: float | None,
        metric_label: str,
        occurred_on: date | None,
        metadata: dict | None = None,
    ) -> tuple[StudentAlertEventRecord, bool]:
        with self._session() as db:
            existing = db.scalar(
                select(orm.StudentAlertEvent).where(
                    orm.StudentAlertEvent.student_id == student_id,
                    orm.StudentAlertEvent.assessment_id == assessment_id,
                    orm.StudentAlertEvent.reason == reason,
                )
            )
            if existing is not None:
                return self._student_alert_event_from_row(existing), False
            row = orm.StudentAlertEvent(
                id=f"student-alert-{uuid4()}",
                student_id=student_id,
                class_id=class_id,
                assessment_id=assessment_id,
                reason=reason,
                reason_label=reason_label,
                metric_value=metric_value,
                metric_label=metric_label,
                occurred_on=occurred_on,
                meta=metadata or {},
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return self._student_alert_event_from_row(row), True

    def mark_student_alert_event_notified(self, alert_event_id: str) -> StudentAlertEventRecord | None:
        with self._session() as db:
            row = db.get(orm.StudentAlertEvent, alert_event_id)
            if row is None:
                return None
            row.notified_at = datetime.now(UTC)
            db.commit()
            db.refresh(row)
            return self._student_alert_event_from_row(row)

    def create_parent_notification_if_new(
        self,
        *,
        parent_user_id: str,
        student_id: str,
        notification_type: str,
        title: str,
        content: str,
        source_type: str,
        source_id: str,
        created_by_user_id: str | None,
        metadata: dict | None = None,
        zalo_status: str = "skipped",
    ) -> tuple[ParentNotificationRecord, bool]:
        with self._session() as db:
            existing = db.scalar(
                select(orm.ParentNotification).where(
                    orm.ParentNotification.parent_user_id == parent_user_id,
                    orm.ParentNotification.source_type == source_type,
                    orm.ParentNotification.source_id == source_id,
                    orm.ParentNotification.student_id == student_id,
                )
            )
            if existing is not None:
                return self._parent_notification_from_row(existing), False
            row = orm.ParentNotification(
                id=f"parent-notification-{uuid4()}",
                parent_user_id=parent_user_id,
                student_id=student_id,
                type=notification_type,
                title=title,
                content=content,
                source_type=source_type,
                source_id=source_id,
                created_by_user_id=created_by_user_id,
                zalo_status=zalo_status,
                meta=metadata or {},
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return self._parent_notification_from_row(row), True

    def update_parent_notification_zalo_status(
        self,
        notification_id: str,
        *,
        zalo_status: str,
        zalo_error: str | None = None,
        sent_zalo_at: datetime | None = None,
    ) -> ParentNotificationRecord | None:
        with self._session() as db:
            row = db.get(orm.ParentNotification, notification_id)
            if row is None:
                return None
            row.zalo_status = zalo_status
            row.zalo_error = zalo_error
            row.sent_zalo_at = sent_zalo_at
            db.commit()
            db.refresh(row)
            return self._parent_notification_from_row(row)

    def list_parent_notifications(self, parent_user_id: str, limit: int = 50) -> list[ParentNotificationRecord]:
        with self._session() as db:
            rows = db.scalars(
                select(orm.ParentNotification)
                .where(orm.ParentNotification.parent_user_id == parent_user_id)
                .order_by(orm.ParentNotification.created_at.desc())
                .limit(limit)
            ).all()
            return [self._parent_notification_from_row(row) for row in rows]

    def mark_parent_notification_read(self, notification_id: str, parent_user_id: str) -> ParentNotificationRecord | None:
        with self._session() as db:
            row = db.scalar(
                select(orm.ParentNotification).where(
                    orm.ParentNotification.id == notification_id,
                    orm.ParentNotification.parent_user_id == parent_user_id,
                )
            )
            if row is None:
                return None
            row.read_at = row.read_at or datetime.now(UTC)
            db.commit()
            db.refresh(row)
            return self._parent_notification_from_row(row)

    def create_scheduled_zalo_notification_if_new(
        self,
        *,
        parent_user_id: str,
        student_id: str,
        source_type: str,
        source_id: str,
        send_at: datetime,
        title: str,
        content: str,
        metadata: dict | None = None,
    ) -> tuple[dict, bool]:
        with self._session() as db:
            existing = db.scalar(
                select(orm.ScheduledZaloNotification).where(
                    orm.ScheduledZaloNotification.parent_user_id == parent_user_id,
                    orm.ScheduledZaloNotification.student_id == student_id,
                    orm.ScheduledZaloNotification.source_type == source_type,
                    orm.ScheduledZaloNotification.source_id == source_id,
                )
            )
            if existing is not None:
                return self._scheduled_zalo_notification_dict(existing), False
            row = orm.ScheduledZaloNotification(
                id=f"scheduled-zalo-{uuid4()}",
                parent_user_id=parent_user_id,
                student_id=student_id,
                source_type=source_type,
                source_id=source_id,
                send_at=send_at,
                title=title,
                content=content,
                status="pending",
                meta=metadata or {},
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return self._scheduled_zalo_notification_dict(row), True

    def list_due_scheduled_zalo_notifications(self, *, now: datetime, limit: int = 50) -> list[dict]:
        with self._session() as db:
            rows = db.scalars(
                select(orm.ScheduledZaloNotification)
                .where(
                    orm.ScheduledZaloNotification.status == "pending",
                    orm.ScheduledZaloNotification.send_at <= now,
                )
                .order_by(orm.ScheduledZaloNotification.send_at)
                .limit(limit)
            ).all()
            return [self._scheduled_zalo_notification_dict(row) for row in rows]

    def mark_scheduled_zalo_notification_sent(self, notification_id: str, *, sent_at: datetime) -> dict | None:
        with self._session() as db:
            row = db.get(orm.ScheduledZaloNotification, notification_id)
            if row is None:
                return None
            row.status = "sent"
            row.sent_at = sent_at
            row.last_error = None
            db.commit()
            db.refresh(row)
            return self._scheduled_zalo_notification_dict(row)

    def mark_scheduled_zalo_notification_failed(self, notification_id: str, *, error: str) -> dict | None:
        with self._session() as db:
            row = db.get(orm.ScheduledZaloNotification, notification_id)
            if row is None:
                return None
            row.status = "failed"
            row.last_error = error
            db.commit()
            db.refresh(row)
            return self._scheduled_zalo_notification_dict(row)

    def mark_scheduled_zalo_notification_skipped(self, notification_id: str, *, reason: str) -> dict | None:
        with self._session() as db:
            row = db.get(orm.ScheduledZaloNotification, notification_id)
            if row is None:
                return None
            row.status = "skipped"
            row.last_error = reason
            db.commit()
            db.refresh(row)
            return self._scheduled_zalo_notification_dict(row)

    def is_class_scheduled_on(self, class_id: str, scheduled_for: date) -> bool:
        with self._session() as db:
            row = db.get(orm.Class, class_id)
            class_record = self._class_from_row(row) if row else None
        if class_record is None:
            return False
        if scheduled_for.weekday() not in _weekdays_from_schedule_note(class_record.schedule_note):
            return False
        if class_record.starts_on and scheduled_for < class_record.starts_on:
            return False
        if class_record.ends_on and scheduled_for > class_record.ends_on:
            return False
        return True

    def get_parent_dashboard_schedule(self, student_id: str, *, start: date, upcoming_limit: int = 2) -> dict:
        with self._session() as db:
            classes = db.scalars(
                select(orm.Class)
                .join(orm.Enrollment, orm.Enrollment.class_id == orm.Class.id)
                .where(orm.Enrollment.student_id == student_id, orm.Enrollment.status == "active")
            ).all()
            class_ids = [row.id for row in classes]
            action_rows = db.scalars(
                select(orm.TeacherClassActionDraft)
                .where(
                    orm.TeacherClassActionDraft.class_id.in_(class_ids),
                    orm.TeacherClassActionDraft.scheduled_for >= start,
                    orm.TeacherClassActionDraft.status == "sent",
                )
                .order_by(
                    orm.TeacherClassActionDraft.scheduled_for,
                    orm.TeacherClassActionDraft.sent_at.desc().nulls_last(),
                    orm.TeacherClassActionDraft.created_at.desc(),
                )
            ).all() if class_ids else []

        latest_action_by_session: dict[tuple[str, date], orm.TeacherClassActionDraft] = {}
        for row in action_rows:
            if row.scheduled_for is None:
                continue
            latest_action_by_session.setdefault((row.class_id, row.scheduled_for), row)

        actions_by_session: dict[tuple[str, date], list[dict]] = {}
        for session_key, row in latest_action_by_session.items():
            actions_by_session[session_key] = [{
                "id": row.id,
                "class_id": row.class_id,
                "action_type": row.action_type,
                "content": row.content,
                "scheduled_for": row.scheduled_for,
                "sent_at": row.sent_at,
                "created_at": row.created_at,
            }]

        sessions: list[dict] = []
        horizon = start + timedelta(days=370)
        for class_row in classes:
            weekdays = _weekdays_from_schedule_note(class_row.schedule_note)
            if not weekdays:
                continue
            current = max(start, class_row.starts_on or start)
            class_end = min(horizon, class_row.ends_on or horizon)
            while current <= class_end:
                if current.weekday() in weekdays:
                    sessions.append(
                        {
                            "class_id": class_row.id,
                            "class_name": class_row.name,
                            "class_date": current,
                            "schedule_note": class_row.schedule_note,
                            "location": class_row.location,
                            "actions": actions_by_session.get((class_row.id, current), []),
                        }
                    )
                current += timedelta(days=1)
        sessions.sort(key=lambda item: (item["class_date"], item["class_name"]))

        class_by_id = {row.id: row for row in classes}
        alerts = []
        for row in latest_action_by_session.values():
            class_row = class_by_id.get(row.class_id)
            if class_row is None or row.scheduled_for is None:
                continue
            alerts.append(
                {
                    "id": row.id,
                    "class_id": row.class_id,
                    "class_name": class_row.name,
                    "class_date": row.scheduled_for,
                    "schedule_note": class_row.schedule_note,
                    "location": class_row.location,
                    "action_type": row.action_type,
                    "content": row.content,
                    "sent_at": row.sent_at,
                    "created_at": row.created_at,
                }
            )
        return {"upcoming_classes": sessions[:upcoming_limit], "class_alerts": alerts}

    def get_assignment_completion_for_student(self, student_id: str) -> dict:
        with self._session() as db:
            assessment_ids = list(
                db.scalars(
                    select(orm.Assessment.id)
                    .join(orm.Enrollment, orm.Enrollment.class_id == orm.Assessment.class_id)
                    .where(
                        orm.Enrollment.student_id == student_id,
                        orm.Enrollment.status == "active",
                        or_(orm.Assessment.assessment_date.is_(None), orm.Assessment.assessment_date <= date.today()),
                    )
                    .distinct()
                ).all()
            )
            if not assessment_ids:
                return {"completed": 0, "total": 0}
            completed_ids = set(
                db.scalars(
                    select(orm.AssessmentQuestion.assessment_id)
                    .join(orm.StudentAnswer, orm.StudentAnswer.assessment_question_id == orm.AssessmentQuestion.id)
                    .where(
                        orm.StudentAnswer.student_id == student_id,
                        orm.AssessmentQuestion.assessment_id.in_(assessment_ids),
                    )
                    .distinct()
                ).all()
            )
        return {"completed": len(completed_ids), "total": len(assessment_ids)}

    def get_teacher_feedback(self, student_id: str) -> list[TeacherFeedback]:
        with self._session() as db:
            return [TeacherFeedback(id=r.id, student_id=r.student_id, teacher_name=r.teacher_name, comment=r.comment, created_at=r.created_at) for r in db.scalars(select(orm.TeacherFeedback).where(orm.TeacherFeedback.student_id == student_id)).all()]

    def get_question(self, question_id: str) -> AssessmentQuestion | None:
        with self._session() as db:
            row = db.get(orm.AssessmentQuestion, question_id)
            if not row:
                return None
            return AssessmentQuestion(id=row.id, assessment_id=row.assessment_id, skill=row.skill_tag, prompt=row.question_text, rubric=str(row.rubric_criteria), max_score=row.max_score)

    def create_assessment(
        self,
        *,
        class_id: str,
        title: str,
        description: str | None,
        assessment_date: date | None,
        teacher_id: str,
        duration_minutes: int | None = None,
        lockdown_enabled: bool = False,
        max_violation_count: int | None = 2,
    ) -> dict:
        with self._session() as db:
            row = orm.Assessment(
                id=f"assessment-{uuid4()}",
                class_id=class_id,
                title=title,
                description=description,
                assessment_date=assessment_date,
                duration_minutes=duration_minutes,
                lockdown_enabled=lockdown_enabled,
                max_violation_count=max_violation_count,
                created_by_teacher_id=teacher_id,
                created_at=datetime.now(UTC),
            )
            db.add(row)
            db.commit()
            return self._assessment_dict(row)

    def _assessment_dict(self, row: orm.Assessment) -> dict:
        return {
            "id": row.id,
            "class_id": row.class_id,
            "title": row.title,
            "description": row.description,
            "assessment_date": row.assessment_date,
            "duration_minutes": row.duration_minutes,
            "lockdown_enabled": row.lockdown_enabled,
            "max_violation_count": row.max_violation_count,
            "created_by_teacher_id": row.created_by_teacher_id,
            "created_at": row.created_at,
        }

    def get_assessment(self, assessment_id: str) -> dict | None:
        with self._session() as db:
            row = db.get(orm.Assessment, assessment_id)
            return self._assessment_dict(row) if row else None

    def delete_assessment(self, assessment_id: str) -> bool:
        with self._session() as db:
            row = db.get(orm.Assessment, assessment_id)
            if row is None:
                return False
            db.delete(row)
            db.commit()
            return True

    def get_assessments_for_class(self, class_id: str) -> list[dict]:
        with self._session() as db:
            rows = db.scalars(
                select(orm.Assessment)
                .where(orm.Assessment.class_id == class_id)
                .order_by(orm.Assessment.created_at.desc())
            ).all()
            stats_by_assessment = self._get_assessment_submission_stats_for_class(db, class_id)
            return [
                {
                    **self._assessment_dict(row),
                    "submission_stats": stats_by_assessment.get(
                        row.id,
                        {
                            "total_students": 0,
                            "submitted_students": 0,
                            "graded_students": 0,
                            "insight_students": 0,
                        },
                    ),
                }
                for row in rows
            ]

    def _get_assessment_submission_stats_for_class(self, db: Session, class_id: str) -> dict[str, dict[str, int]]:
        assessment_ids = db.scalars(
            select(orm.Assessment.id).where(orm.Assessment.class_id == class_id)
        ).all()
        if not assessment_ids:
            return {}

        total_students = len(
            set(
                db.scalars(
                    select(orm.Enrollment.student_id).where(
                        orm.Enrollment.class_id == class_id,
                        orm.Enrollment.status == "active",
                    )
                ).all()
            )
        )

        stats_by_assessment = {
            assessment_id: {
                "total_students": total_students,
                "submitted_students": 0,
                "graded_students": 0,
                "insight_students": 0,
            }
            for assessment_id in assessment_ids
        }

        submitted_rows = db.execute(
            select(orm.AssessmentQuestion.assessment_id, orm.StudentAnswer.student_id)
            .join(
                orm.StudentAnswer,
                orm.StudentAnswer.assessment_question_id == orm.AssessmentQuestion.id,
            )
            .where(orm.AssessmentQuestion.assessment_id.in_(assessment_ids))
            .distinct()
        ).all()
        for assessment_id, student_id in submitted_rows:
            if assessment_id in stats_by_assessment and student_id:
                stats_by_assessment[assessment_id]["submitted_students"] += 1

        graded_rows = db.execute(
            select(orm.SkillScore.source, orm.SkillScore.student_id)
            .where(
                orm.SkillScore.class_id == class_id,
                orm.SkillScore.source.is_not(None),
                orm.SkillScore.source.like("assessment:%"),
            )
            .distinct()
        ).all()
        for source, student_id in graded_rows:
            assessment_id = source.removeprefix("assessment:") if source else None
            if assessment_id in stats_by_assessment and student_id:
                stats_by_assessment[assessment_id]["graded_students"] += 1

        insight_rows = db.execute(
            select(orm.AiInsight.assessment_id, orm.AiInsight.student_id)
            .where(
                orm.AiInsight.assessment_id.in_(assessment_ids),
                orm.AiInsight.student_id.is_not(None),
                orm.AiInsight.is_stale.is_(False),
            )
            .distinct()
        ).all()
        for assessment_id, student_id in insight_rows:
            if assessment_id in stats_by_assessment and student_id:
                stats_by_assessment[assessment_id]["insight_students"] += 1

        return stats_by_assessment

    def get_assessments_for_student(self, student_id: str) -> list[dict]:
        with self._session() as db:
            rows = db.scalars(
                select(orm.Assessment)
                .join(orm.Enrollment, orm.Enrollment.class_id == orm.Assessment.class_id)
                .where(
                    orm.Enrollment.student_id == student_id,
                    orm.Enrollment.status == "active",
                    or_(orm.Assessment.assessment_date.is_(None), orm.Assessment.assessment_date <= date.today()),
                )
                .order_by(orm.Assessment.assessment_date.desc().nullslast(), orm.Assessment.created_at.desc())
            ).all()
            return [self._assessment_dict(row) for row in rows]

    def get_assessment_status_for_student(self, student_id: str) -> list[dict]:
        """Return submission state for assessments in the student's active classes."""
        with self._session() as db:
            rows = db.execute(
                select(orm.Assessment, orm.AssessmentAttempt)
                .join(orm.Enrollment, orm.Enrollment.class_id == orm.Assessment.class_id)
                .outerjoin(
                    orm.AssessmentAttempt,
                    (orm.AssessmentAttempt.assessment_id == orm.Assessment.id)
                    & (orm.AssessmentAttempt.student_id == student_id),
                )
                .where(
                    orm.Enrollment.student_id == student_id,
                    orm.Enrollment.status == "active",
                    or_(orm.Assessment.assessment_date.is_(None), orm.Assessment.assessment_date <= date.today()),
                )
                .order_by(orm.Assessment.assessment_date.desc().nullslast(), orm.Assessment.created_at.desc())
            ).all()
            assessment_ids = [assessment.id for assessment, _attempt in rows]
            answered_assessment_ids = set(
                db.scalars(
                    select(orm.AssessmentQuestion.assessment_id)
                    .join(orm.StudentAnswer, orm.StudentAnswer.assessment_question_id == orm.AssessmentQuestion.id)
                    .where(
                        orm.StudentAnswer.student_id == student_id,
                        orm.AssessmentQuestion.assessment_id.in_(assessment_ids),
                    )
                    .distinct()
                ).all()
            ) if assessment_ids else set()

            result = []
            for assessment, attempt in rows:
                if (attempt and attempt.status == "submitted") or assessment.id in answered_assessment_ids:
                    submission_status = "submitted"
                elif attempt is not None:
                    submission_status = "in_progress"
                else:
                    submission_status = "not_started"
                result.append(
                    {
                        "assessment_id": assessment.id,
                        "title": assessment.title,
                        "assessment_date": assessment.assessment_date,
                        "submission_status": submission_status,
                    }
                )
            return result

    def create_assessment_question(self, *, assessment_id: str, question_text: str, question_type: str, choices: list[str], expected_answer: str | None, skill_tag: EnglishSkill, max_score: float, rubric_criteria: dict, score_range: str) -> dict:
        with self._session() as db:
            position = db.scalar(select(orm.AssessmentQuestion).where(orm.AssessmentQuestion.assessment_id == assessment_id).order_by(orm.AssessmentQuestion.position.desc()).limit(1))
            next_pos = (position.position if position else 0) + 1
            normalized_rubric = normalize_rubric_criteria(skill_tag, rubric_criteria)
            row = orm.AssessmentQuestion(id=f"question-{uuid4()}", assessment_id=assessment_id, question_text=question_text, question_type=question_type, choices=choices, expected_answer=expected_answer, skill_tag=skill_tag.value, max_score=max_score, position=next_pos, rubric_criteria=normalized_rubric, score_range=score_range, created_at=datetime.now(UTC))
            db.add(row)
            db.commit()
            return self._question_dict(row)

    def _question_dict(self, row: orm.AssessmentQuestion) -> dict:
        return {"id": row.id, "assessment_id": row.assessment_id, "question_text": row.question_text, "question_type": row.question_type, "choices": row.choices, "expected_answer": row.expected_answer, "skill_tag": EnglishSkill(row.skill_tag), "max_score": row.max_score, "position": row.position, "rubric_criteria": row.rubric_criteria, "score_range": row.score_range, "created_at": row.created_at}

    def get_assessment_question(self, question_id: str) -> dict | None:
        with self._session() as db:
            row = db.get(orm.AssessmentQuestion, question_id)
            return self._question_dict(row) if row else None

    def update_assessment_question(
        self,
        *,
        question_id: str,
        question_text: str,
        question_type: str,
        choices: list[str],
        expected_answer: str | None,
        skill_tag: EnglishSkill,
        max_score: float,
        rubric_criteria: dict,
        score_range: str,
    ) -> dict | None:
        with self._session() as db:
            row = db.get(orm.AssessmentQuestion, question_id)
            if row is None:
                return None
            row.question_text = question_text
            row.question_type = question_type
            row.choices = choices
            row.expected_answer = expected_answer
            row.skill_tag = skill_tag.value
            row.max_score = max_score
            row.rubric_criteria = normalize_rubric_criteria(skill_tag, rubric_criteria)
            row.score_range = score_range
            db.commit()
            db.refresh(row)
            return self._question_dict(row)

    def delete_assessment_question(self, question_id: str) -> bool:
        with self._session() as db:
            row = db.get(orm.AssessmentQuestion, question_id)
            if row is None:
                return False
            db.delete(row)
            db.commit()
            return True

    def delete_questions_for_assessment(self, assessment_id: str) -> int:
        with self._session() as db:
            result = db.execute(delete(orm.AssessmentQuestion).where(orm.AssessmentQuestion.assessment_id == assessment_id))
            db.commit()
            return int(result.rowcount or 0)

    def get_questions_for_assessment(self, assessment_id: str) -> list[dict]:
        with self._session() as db:
            return [self._question_dict(row) for row in db.scalars(select(orm.AssessmentQuestion).where(orm.AssessmentQuestion.assessment_id == assessment_id).order_by(orm.AssessmentQuestion.position)).all()]

    def get_public_questions_for_assessment(self, assessment_id: str) -> list[dict]:
        return [self._public_question_dict(question) for question in self.get_questions_for_assessment(assessment_id)]

    def _public_question_dict(self, question: dict) -> dict:
        return {
            "id": question["id"],
            "assessment_id": question["assessment_id"],
            "question_text": question["question_text"],
            "question_type": question["question_type"],
            "choices": question["choices"],
            "skill_tag": question["skill_tag"],
            "max_score": question["max_score"],
            "position": question["position"],
        }

    def create_student_answer(self, *, student_id: str, question_id: str, answer_text: str, submitted_at: datetime | None, score_awarded: float | None = None, teacher_feedback: str | None = None) -> dict:
        with self._session() as db:
            row = orm.StudentAnswer(id=f"answer-{uuid4()}", student_id=student_id, assessment_question_id=question_id, answer_text=answer_text, score_awarded=score_awarded, teacher_feedback=teacher_feedback, submitted_at=submitted_at or datetime.now(UTC))
            db.add(row)
            self._mark_ai_insight_stale(db, student_id)
            db.commit()
            return self._answer_dict(row)

    def _answer_dict(self, row: orm.StudentAnswer) -> dict:
        return {"id": row.id, "student_id": row.student_id, "assessment_question_id": row.assessment_question_id, "answer_text": row.answer_text, "score_awarded": row.score_awarded, "teacher_feedback": row.teacher_feedback, "submitted_at": row.submitted_at}

    def upsert_student_answer(self, *, student_id: str, question_id: str, answer_text: str, submitted_at: datetime | None, score_awarded: float | None = None, teacher_feedback: str | None = None) -> dict:
        with self._session() as db:
            row = db.scalar(select(orm.StudentAnswer).where(orm.StudentAnswer.student_id == student_id, orm.StudentAnswer.assessment_question_id == question_id))
            if row is None:
                row = orm.StudentAnswer(id=f"answer-{uuid4()}", student_id=student_id, assessment_question_id=question_id, answer_text=answer_text, submitted_at=submitted_at or datetime.now(UTC))
                db.add(row)
            else:
                row.answer_text = answer_text
                row.submitted_at = submitted_at or datetime.now(UTC)
            row.score_awarded = score_awarded
            row.teacher_feedback = teacher_feedback
            self._mark_ai_insight_stale(db, student_id)
            db.commit()
            db.refresh(row)
            return self._answer_dict(row)

    def get_student_answer(self, answer_id: str) -> dict | None:
        with self._session() as db:
            row = db.get(orm.StudentAnswer, answer_id)
            return self._answer_dict(row) if row else None

    def get_answers_for_student(self, student_id: str) -> list[dict]:
        with self._session() as db:
            return [self._answer_dict(row) for row in db.scalars(select(orm.StudentAnswer).where(orm.StudentAnswer.student_id == student_id).order_by(orm.StudentAnswer.submitted_at.desc())).all()]

    def get_answers_for_student_assessment(self, student_id: str, assessment_id: str) -> list[dict]:
        with self._session() as db:
            rows = db.scalars(
                select(orm.StudentAnswer)
                .join(orm.AssessmentQuestion, orm.AssessmentQuestion.id == orm.StudentAnswer.assessment_question_id)
                .where(
                    orm.StudentAnswer.student_id == student_id,
                    orm.AssessmentQuestion.assessment_id == assessment_id,
                )
                .order_by(orm.AssessmentQuestion.position)
            ).all()
            return [self._answer_dict(row) for row in rows]

    def _assessment_attempt_dict(self, row: orm.AssessmentAttempt) -> dict:
        return {
            "id": row.id,
            "student_id": row.student_id,
            "assessment_id": row.assessment_id,
            "started_at": row.started_at,
            "expires_at": row.expires_at,
            "submitted_at": row.submitted_at,
            "status": row.status,
            "violation_count": row.violation_count,
        }

    def get_assessment_attempt(self, *, student_id: str, assessment_id: str) -> dict | None:
        with self._session() as db:
            row = db.scalar(
                select(orm.AssessmentAttempt).where(
                    orm.AssessmentAttempt.student_id == student_id,
                    orm.AssessmentAttempt.assessment_id == assessment_id,
                )
            )
            return self._assessment_attempt_dict(row) if row else None

    def get_assessment_attempt_by_id(self, attempt_id: str) -> dict | None:
        with self._session() as db:
            row = db.get(orm.AssessmentAttempt, attempt_id)
            return self._assessment_attempt_dict(row) if row else None

    def create_assessment_attempt(self, *, student_id: str, assessment_id: str, started_at: datetime, expires_at: datetime | None) -> dict:
        with self._session() as db:
            existing = db.scalar(
                select(orm.AssessmentAttempt).where(
                    orm.AssessmentAttempt.student_id == student_id,
                    orm.AssessmentAttempt.assessment_id == assessment_id,
                )
            )
            if existing is not None:
                return self._assessment_attempt_dict(existing)
            row = orm.AssessmentAttempt(
                id=f"attempt-{uuid4()}",
                student_id=student_id,
                assessment_id=assessment_id,
                started_at=started_at,
                expires_at=expires_at,
                status="in_progress",
                violation_count=0,
                created_at=started_at,
                updated_at=started_at,
            )
            db.add(row)
            db.commit()
            return self._assessment_attempt_dict(row)

    def update_assessment_attempt(
        self,
        attempt_id: str,
        *,
        status: str | None = None,
        submitted_at: datetime | None = None,
        increment_violation: bool = False,
    ) -> dict | None:
        with self._session() as db:
            row = db.get(orm.AssessmentAttempt, attempt_id)
            if row is None:
                return None
            if status is not None:
                row.status = status
            if submitted_at is not None:
                row.submitted_at = submitted_at
            if increment_violation:
                row.violation_count += 1
            row.updated_at = datetime.now(UTC)
            db.commit()
            db.refresh(row)
            return self._assessment_attempt_dict(row)

    def create_assessment_attempt_event(
        self,
        *,
        attempt_id: str,
        event_type: str,
        occurred_at: datetime,
        metadata: dict,
        increment_violation: bool = False,
    ) -> dict:
        with self._session() as db:
            event = orm.AssessmentAttemptEvent(
                id=f"attempt-event-{uuid4()}",
                attempt_id=attempt_id,
                event_type=event_type,
                occurred_at=occurred_at,
                metadata_json=metadata,
            )
            db.add(event)
            attempt = db.get(orm.AssessmentAttempt, attempt_id)
            if attempt is not None and increment_violation:
                attempt.violation_count += 1
                attempt.updated_at = datetime.now(UTC)
            db.commit()
            if attempt is not None:
                db.refresh(attempt)
                return self._assessment_attempt_dict(attempt)
            return {}

    def get_assessment_summary_for_student(self, student_id: str, assessment_id: str | None = None) -> dict:
        with self._session() as db:
            conditions = [orm.StudentAnswer.student_id == student_id]
            if assessment_id:
                conditions.append(orm.Assessment.id == assessment_id)
            finalized_sources = db.scalars(
                select(orm.SkillScore.source)
                .where(
                    orm.SkillScore.student_id == student_id,
                    orm.SkillScore.source.like("assessment:%"),
                )
                .distinct()
            ).all()
            finalized_assessment_ids = {
                source.removeprefix("assessment:")
                for source in finalized_sources
                if source
            }
            rows = db.execute(
                select(orm.Assessment, orm.AssessmentQuestion, orm.StudentAnswer)
                .join(orm.AssessmentQuestion, orm.AssessmentQuestion.assessment_id == orm.Assessment.id)
                .join(orm.StudentAnswer, orm.StudentAnswer.assessment_question_id == orm.AssessmentQuestion.id)
                .where(*conditions)
                .order_by(orm.Assessment.assessment_date.desc().nullslast(), orm.Assessment.created_at.desc(), orm.AssessmentQuestion.position)
            ).all()

            assessments: dict[str, dict] = {}
            skills: dict[str, dict] = {}
            for assessment, question, answer in rows:
                is_finalized = assessment.id in finalized_assessment_ids
                assessment_item = assessments.setdefault(
                    assessment.id,
                    {
                        "id": assessment.id,
                        "title": assessment.title,
                        "class_id": assessment.class_id,
                        "assessment_date": assessment.assessment_date.isoformat() if assessment.assessment_date else None,
                        "created_at": assessment.created_at.isoformat() if assessment.created_at else None,
                        "is_finalized": is_finalized,
                        "total_score": 0.0 if is_finalized else None,
                        "max_score": 0.0,
                        "questions": [],
                    },
                )
                question_payload = {
                    "question_type": question.question_type,
                    "skill_tag": question.skill_tag,
                    "expected_answer": question.expected_answer,
                    "max_score": question.max_score,
                }
                auto_score = auto_score_answer(question_payload, answer.answer_text)
                score = answer.score_awarded if answer.score_awarded is not None else auto_score
                assessment_item["max_score"] += question.max_score
                if is_finalized and score is not None:
                    assessment_item["total_score"] += score

                if is_finalized:
                    skill = skills.setdefault(question.skill_tag, {"score": 0.0, "max_score": 0.0, "answered": 0})
                    skill["max_score"] += question.max_score
                    skill["answered"] += 1
                    if score is not None:
                        skill["score"] += score

                assessment_item["questions"].append(
                    {
                        "question_id": question.id,
                        "question_type": question.question_type,
                        "skill": question.skill_tag,
                        "question_text": question.question_text,
                        "expected_answer": question.expected_answer,
                        "student_answer": answer.answer_text,
                        "score_awarded": score,
                        "max_score": question.max_score,
                        "teacher_feedback": answer.teacher_feedback,
                        "rubric_criteria": question.rubric_criteria,
                    }
                )

            skill_summary = {
                skill: {
                    "score": round(values["score"], 2),
                    "max_score": round(values["max_score"], 2),
                    "percent": round(values["score"] / values["max_score"] * 100, 1) if values["max_score"] else None,
                    "answered": values["answered"],
                }
                for skill, values in skills.items()
            }
            strengths = [f"{skill}: {item['percent']}%" for skill, item in skill_summary.items() if item["percent"] is not None and item["percent"] >= 80]
            weaknesses = [f"{skill}: {item['percent']}%" for skill, item in skill_summary.items() if item["percent"] is not None and item["percent"] < 70]
            return {
                "student_id": student_id,
                "assessment_id": assessment_id,
                "assessments": list(assessments.values()),
                "skill_summary": skill_summary,
                "strengths": strengths,
                "weaknesses": weaknesses,
            }

    def get_recent_assessment_trend_for_student(self, student_id: str, current_assessment_id: str, limit: int = 2) -> list[dict]:
        summary = self.get_assessment_summary_for_student(student_id)
        assessments = sorted(
            [assessment for assessment in summary["assessments"] if assessment.get("is_finalized")],
            key=lambda item: (item.get("assessment_date") or "", item.get("created_at") or ""),
            reverse=True,
        )
        if not assessments:
            return []
        current_index = next((index for index, assessment in enumerate(assessments) if assessment["id"] == current_assessment_id), None)
        if current_index is None:
            return assessments[:limit]
        if current_index < limit:
            return assessments[:limit]
        selected = [assessments[current_index]]
        older = assessments[current_index + 1 : current_index + limit]
        selected.extend(older)
        if len(selected) < limit and current_index > 0:
            selected.extend(assessments[max(0, current_index - (limit - len(selected))) : current_index])
        return selected[:limit]

    def _document_dict(self, row: orm.Document) -> dict:
        return {
            "id": row.id,
            "title": row.title,
            "document_type": row.document_type,
            "locale": row.locale,
            "content": row.content,
            "source_uri": row.source_uri,
        }

    def create_document(self, *, title: str, document_type: str, content: str, locale: str, source_uri: str | None = None) -> dict:
        with self._session() as db:
            row = orm.Document(
                id=f"doc-{uuid4()}",
                title=title,
                document_type=document_type,
                locale=locale,
                content=content,
                source_uri=source_uri,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return self._document_dict(row)

    def upsert_document_by_source_uri(self, *, title: str, document_type: str, content: str, locale: str, source_uri: str) -> dict:
        with self._session() as db:
            row = db.scalar(select(orm.Document).where(orm.Document.source_uri == source_uri))
            if row is None:
                row = orm.Document(
                    id=f"doc-{uuid4()}",
                    title=title,
                    document_type=document_type,
                    content=content,
                    locale=locale,
                    source_uri=source_uri,
                )
                db.add(row)
            else:
                row.title = title
                row.document_type = document_type
                row.content = content
                row.locale = locale
                row.source_uri = source_uri
            db.commit()
            db.refresh(row)
            return self._document_dict(row)

    def get_document(self, document_id: str) -> dict | None:
        with self._session() as db:
            row = db.get(orm.Document, document_id)
            return self._document_dict(row) if row else None

    def replace_document_chunks(self, *, document_id: str, chunks: list[dict]) -> int:
        with self._session() as db:
            db.execute(delete(orm.DocumentChunk).where(orm.DocumentChunk.document_id == document_id))
            for chunk in chunks:
                db.execute(
                    text(
                        """
                        INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding, metadata)
                        VALUES (:id, :document_id, :chunk_index, :content, CAST(:embedding AS vector), CAST(:metadata AS json))
                        """
                    ),
                    {
                        "id": chunk["id"],
                        "document_id": document_id,
                        "chunk_index": chunk["chunk_index"],
                        "content": chunk["content"],
                        "embedding": _vector_literal(chunk["embedding"]),
                        "metadata": json.dumps(chunk["metadata"]),
                    },
                )
            db.commit()
            return len(chunks)

    def search_document_chunks(
        self,
        *,
        embedding: list[float],
        limit: int = 5,
        max_distance: float = 0.85,
        document_types: list[str] | None = None,
    ) -> list[RagDocument]:
        type_filter = "WHERE d.document_type = ANY(:document_types)" if document_types else ""
        with self._session() as db:
            rows = db.execute(
                text(
                    f"""
                    SELECT
                        c.id AS chunk_id,
                        c.document_id,
                        c.chunk_index,
                        c.content,
                        c.metadata,
                        d.title,
                        d.document_type,
                        d.locale,
                        (c.embedding <=> CAST(:embedding AS vector)) AS distance
                    FROM document_chunks c
                    JOIN documents d ON d.id = c.document_id
                    {type_filter}
                    ORDER BY c.embedding <=> CAST(:embedding AS vector)
                    LIMIT :limit
                    """
                ),
                {"embedding": _vector_literal(embedding), "limit": limit, "document_types": document_types},
            ).mappings().all()
            results: list[RagDocument] = []
            for row in rows:
                distance = float(row["distance"])
                if distance > max_distance:
                    continue
                results.append(
                    RagDocument(
                        id=row["document_id"],
                        title=row["title"],
                        source_type=row["document_type"],
                        content=row["content"],
                        locale=row["locale"],
                        score=round(1 - distance, 6),
                        metadata={
                            **(row["metadata"] or {}),
                            "chunk_id": row["chunk_id"],
                            "chunk_index": row["chunk_index"],
                        },
                    )
                )
            return results

    def search_documents(self, query: str, limit: int = 5, document_types: list[str] | None = None) -> list[RagDocument]:
        from app.services.rag import embed_text

        return self.search_document_chunks(embedding=embed_text(query), limit=limit, document_types=document_types)

    def save_answer_analysis(self, student_answer_id: str, analysis: StudentAnswerAnalysis | AnswerAnalysisRecord, created_by_user_id: str | None = None) -> StudentAnswerAnalysis | AnswerAnalysisRecord:
        with self._session() as db:
            row = orm.AnswerAnalysis(id=getattr(analysis, "id", f"analysis-{uuid4()}"), student_answer_id=student_answer_id, is_correct=getattr(analysis, "is_correct", False), score_suggestion=getattr(analysis, "score_suggestion", 0), strengths=analysis.strengths, mistakes=getattr(analysis, "mistakes", []), missing_concepts=getattr(analysis, "missing_concepts", []), skill_tags=[skill.value if hasattr(skill, "value") else str(skill) for skill in getattr(analysis, "skill_tags", [])], parent_friendly_explanation=getattr(analysis, "parent_friendly_explanation", getattr(analysis, "parent_insight", "")), suggested_parent_actions=getattr(analysis, "suggested_parent_actions", getattr(analysis, "home_support_recommendations", [])), confidence=getattr(analysis, "confidence", 0.8), created_at=datetime.now(UTC))
            db.add(row)
            db.commit()
            return analysis


repository = PostgresRepository()


def _score_trend_label(change: float | None) -> str:
    if change is None:
        return "no_data"
    if change > 0:
        return "improving"
    if change < 0:
        return "declining"
    return "stable"


def _weekday_label_vi(value: date) -> str:
    labels = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]
    return labels[value.weekday()]


def _skill_label_vi(skill: str) -> str:
    return {
        "reading": "Đọc hiểu",
        "listening": "Nghe hiểu",
        "speaking": "Nói",
        "writing": "Viết",
        "grammar": "Ngữ pháp",
        "vocabulary": "Từ vựng",
    }.get(skill, skill)


def _weekdays_from_schedule_note(schedule_note: str | None) -> set[int]:
    if not schedule_note:
        return set()
    text = schedule_note.casefold()
    normalized = text.replace("thứ", "").replace("thu", "")
    has_saturday = "saturday" in text or "thứ bảy" in text or "thu bay" in text or "bảy" in text or "bay" in text or re.search(r"\b7\b", normalized)
    has_sunday = "sunday" in text or "chủ nhật" in text or "chu nhat" in text
    if re.search(r"\b2\s*[-/]\s*4\s*[-/]\s*6\b", normalized):
        return {0, 2, 4}
    if re.search(r"\b3\s*[-/]\s*5\s*[-/]\s*7\b", normalized):
        return {1, 3, 5}
    if has_saturday and has_sunday:
        return {5, 6}
    weekdays = set()
    if "monday" in text or re.search(r"\b2\b", normalized):
        weekdays.add(0)
    if "tuesday" in text or re.search(r"\b3\b", normalized):
        weekdays.add(1)
    if "wednesday" in text or re.search(r"\b4\b", normalized):
        weekdays.add(2)
    if "thursday" in text or re.search(r"\b5\b", normalized):
        weekdays.add(3)
    if "friday" in text or re.search(r"\b6\b", normalized):
        weekdays.add(4)
    if has_saturday:
        weekdays.add(5)
    if has_sunday:
        weekdays.add(6)
    return weekdays


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"
