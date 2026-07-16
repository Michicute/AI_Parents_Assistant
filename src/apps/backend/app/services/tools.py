import json
import re
from dataclasses import dataclass, field

from fastapi import HTTPException

from app.core.security import assert_student_access
from app.models.domain import Intent, Principal, Role
from app.services.audit import audit_log
from app.services.assessment_insights import ASSESSMENT_PROGRESS_INSIGHT
from app.services.intent_router import OpenAIStudentNameExtractor, StudentNameExtractionError
from app.services.repositories import repository


@dataclass
class AuthorizedContextBundle:
    evidence: list[str] = field(default_factory=list)
    sources: list[dict] = field(default_factory=list)


def retrieve_authorized_context(intent: Intent | list[Intent], principal: Principal, message: str, student_id: str | None) -> AuthorizedContextBundle:
    intents = _normalize_intents(intent)
    context: list[str] = []
    sources: list[dict] = []
    rag_query = _expand_rag_query(message)
    has_active_course = True
    student_id = _resolve_authorized_student_id(principal, message, student_id)
    if student_id:
        student = repository.get_student(student_id)
        if not student:
            return ["No matching student was found."]
        assert_student_access(principal, student.id, student.class_ids)
        audit_log(principal, "read", "student", student.id)
        context.append(f"Authorized student: {student.full_name} ({student.level}).")
        sources.append(_structured_source("Authorized student profile"))

    if Intent.student_progress in intents and student_id:
        progress = repository.get_progress_snapshot(student_id)
        score_trend = repository.get_score_trend_for_student(student_id)
        context.append(
            f"{progress['course']} recent average is {progress['recent_average']} with "
            f"{progress['attendance_rate']:.0%} attendance. Skill snapshot: {progress['skills']}."
        )
        context.append(
            "Authorized read-only score trend from structured gradebook records: "
            f"{json.dumps(score_trend, ensure_ascii=False)}."
        )
        sources.append(_structured_source("Learning progress and gradebook"))

    if Intent.assignment_status in intents and student_id:
        assessments = repository.get_assessment_status_for_student(student_id)
        if assessments:
            context.append(
                "Authorized assessment submission status from structured class records. Assessment date is not a submission deadline: "
                f"{json.dumps(assessments, ensure_ascii=False, default=str)}."
            )
        else:
            context.append("No currently available assessments were found for this student in the authorized records.")
        sources.append(_structured_source("Assessment submission status"))

    if Intent.attendance_summary in intents and student_id:
        attendance = repository.get_attendance(student_id)
        if attendance:
            attendance_payload = [
                {
                    "class_date": item.class_date.isoformat(),
                    "status": item.status,
                    "note": item.note,
                }
                for item in attendance[:10]
            ]
            context.append(
                "Authorized attendance records from structured attendance data: "
                f"{json.dumps(attendance_payload, ensure_ascii=False)}."
            )
        else:
            context.append("No attendance records were found for this student in the authorized records.")
        sources.append(_structured_source("Attendance records"))

    if Intent.schedule in intents and student_id:
        schedule = repository.get_class_schedule_for_student(student_id)
        if schedule:
            context.append(
                "Authorized active class schedule from structured enrollment and class records: "
                f"{json.dumps(schedule, ensure_ascii=False)}."
            )
        else:
            context.append("No active class schedule was found for this student in the authorized records.")
        sources.append(_structured_source("Active class schedule"))

    if Intent.course_information in intents and student_id:
        active_classes = repository.get_class_schedule_for_student(student_id)
        active_courses = list(
            {
                course["course_id"]: {
                    "course_id": course["course_id"],
                    "course_name": course["course_name"],
                    "course_level": course["course_level"],
                }
                for course in active_classes
            }.values()
        )
        if active_courses:
            context.append(
                "Authorized active course from structured enrollment records: "
                f"{json.dumps(active_courses, ensure_ascii=False)}."
            )
            course_terms = " ".join(
                f"CEFR {course['course_level']} {course['course_name']}" for course in active_courses
            )
            rag_query = f"{message} {course_terms}"
        else:
            has_active_course = False
            context.append("No active course was found for this student in the authorized enrollment records.")
        sources.append(_structured_source("Active course enrollment"))

    if Intent.assessment_summary in intents and student_id:
        insights = repository.get_ai_insights_for_student(student_id, ASSESSMENT_PROGRESS_INSIGHT)
        if insights:
            context.append(f"Latest AI assessment insight for authorized student: {insights[0].content}.")
        else:
            summary = repository.get_assessment_summary_for_student(student_id)
            if summary["assessments"]:
                context.append(
                    "Assessment summary for authorized student: "
                    f"skill_summary={summary['skill_summary']}; "
                    f"strengths={summary['strengths']}; weaknesses={summary['weaknesses']}."
                )
            else:
                context.append("No assessment results were found for this student in the authorized records.")
        sources.append(_structured_source("Assessment results and approved insights"))

    rag_document_types = _rag_document_types_for_intents(intents)
    if Intent.course_information in intents and not has_active_course:
        rag_document_types = [document_type for document_type in rag_document_types if document_type != "course_description"]
    if rag_document_types:
        rag_limit = 3 if intents.intersection({Intent.school_policy, Intent.center_policy}) else 5
        docs = repository.search_documents(rag_query, limit=rag_limit, document_types=rag_document_types)
        if docs:
            for doc in docs:
                context.append(f"{doc.title} ({doc.source_type}): {doc.content}")
                metadata = getattr(doc, "metadata", {}) or {}
                sources.append(
                    {
                        "kind": "document",
                        "title": doc.title,
                        "document_type": doc.source_type,
                        "source_uri": metadata.get("source_uri"),
                        "chunk_id": metadata.get("chunk_id"),
                    }
                )
        elif intents.intersection({Intent.school_policy, Intent.center_policy, Intent.parent_handbook, Intent.announcement, Intent.course_information}):
            context.append(f"Information unavailable from authorized documents for retrieval query: {rag_query}")

    if Intent.teacher_contact in intents and student_id:
        feedback = repository.get_teacher_feedback(student_id)
        context.extend([f"Teacher {item.teacher_name} recently noted: {item.comment}" for item in feedback])
        sources.append(_structured_source("Teacher feedback"))

    if not context:
        context.append("Use general parent support guidance and avoid inventing school-specific facts.")
    return AuthorizedContextBundle(evidence=_dedupe_context(context), sources=_dedupe_sources(sources))


def _normalize_intents(intent: Intent | list[Intent]) -> set[Intent]:
    if isinstance(intent, list):
        return set(intent)
    return {intent}


def _expand_rag_query(message: str) -> str:
    text = message.casefold()
    expansions: list[str] = []
    topic_terms = (
        (("xin phép", "nghỉ học", "vắng", "absence"), "absence notification attendance policy"),
        (("học bù", "hoc bu", "make-up", "makeup"), "make-up classes missed lesson suitable class level teacher seat"),
        (("đi học muộn", "học muộn", "đến muộn", "late", "punctuality"), "late arrival attendance punctuality ten minutes"),
        (("hỗ trợ", "ở nhà", "luyện tiếng anh", "home support"), "parent handbook home routine English learning support"),
        (("cefr", "lộ trình", "lo trinh", "pathway"), "CEFR curriculum pathway course placement A1 A2 B1 B2 C1 C2"),
    )
    for terms, expansion in topic_terms:
        if any(term in text for term in terms):
            expansions.append(expansion)
    if not expansions:
        return message
    return f"{message}\nRelated retrieval concepts: {' '.join(expansions)}"


def _structured_source(title: str) -> dict:
    return {"kind": "structured", "title": title, "document_type": None, "source_uri": None, "chunk_id": None}


def _dedupe_sources(sources: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    result: list[dict] = []
    for source in sources:
        key = tuple(source.get(field) for field in ("kind", "title", "document_type", "source_uri", "chunk_id"))
        if key not in seen:
            seen.add(key)
            result.append(source)
    return result


def _dedupe_context(context: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for item in context:
        if item not in seen:
            seen.add(item)
            deduped.append(item)
    return deduped


def _rag_document_types_for_intents(intents: set[Intent]) -> list[str]:
    document_types: list[str] = []
    if intents.intersection({Intent.school_policy, Intent.center_policy}):
        document_types.extend(["center_policy", "faq"])
    if Intent.course_information in intents:
        document_types.append("course_description")
    if intents.intersection({Intent.parent_handbook, Intent.student_progress, Intent.assessment_summary, Intent.general_parent_support}):
        document_types.append("parent_handbook")
    if Intent.announcement in intents:
        document_types.append("announcement")

    deduped: list[str] = []
    for document_type in document_types:
        if document_type not in deduped:
            deduped.append(document_type)
    return deduped


def _resolve_authorized_student_id(principal: Principal, message: str, student_id: str | None) -> str | None:
    if principal.role != Role.parent:
        return student_id

    linked_students = _linked_students_for_parent_principal(principal)
    if not linked_students:
        raise HTTPException(status_code=403, detail="Parent account is not linked to any student")

    if student_id:
        selected = next((student for student in linked_students if student.id == student_id), None)
        if selected is None:
            raise HTTPException(status_code=403, detail="Parent cannot access this student")
    elif len(linked_students) == 1:
        selected = linked_students[0]
        student_id = selected.id
    else:
        selected = _match_linked_student_by_name(message, linked_students)
        if selected is None:
            raise HTTPException(status_code=400, detail="Please choose which linked student this question is about")
        student_id = selected.id

    _assert_message_only_mentions_authorized_student(message, selected.full_name, linked_students)
    return student_id


def _linked_students_for_parent_principal(principal: Principal) -> list[object]:
    if principal.linked_student_ids:
        students = [repository.get_student(student_id) for student_id in principal.linked_student_ids]
        return [student for student in students if student is not None]
    return repository.get_linked_students_for_parent(principal.user_id)


def _match_linked_student_by_name(message: str, linked_students) -> object | None:
    message_tokens = _message_tokens(message)
    for student in linked_students:
        if _student_name_tokens(student.full_name).intersection(message_tokens):
            return student
    return None


def _assert_message_only_mentions_authorized_student(message: str, authorized_name: str, linked_students) -> None:
    normalized_message = _normalize(message)
    authorized_names = [student.full_name for student in linked_students]

    authorized_normalized_names = {_normalize(name) for name in authorized_names}

    for student in repository.list_students():
        if _normalize(student.full_name) in authorized_normalized_names:
            continue
        student_name = _normalize(student.full_name)
        if student_name and student_name in normalized_message:
            raise HTTPException(status_code=403, detail="Parent can only ask about their linked student")

    try:
        extraction = OpenAIStudentNameExtractor().extract(
            message,
            authorized_student_names=authorized_names,
        )
    except StudentNameExtractionError:
        return

    for name in extraction.mentioned_student_names:
        if _matches_known_unauthorized_student_name(name, authorized_names):
            raise HTTPException(status_code=403, detail="Parent can only ask about their linked student")


def _matches_known_unauthorized_student_name(mentioned_name: str, authorized_names: list[str]) -> bool:
    mentioned_normalized = _normalize(mentioned_name)
    mentioned_tokens = _student_name_tokens(mentioned_name)
    if not mentioned_normalized or not mentioned_tokens:
        return False

    authorized_normalized = {_normalize(name) for name in authorized_names}
    authorized_token_sets = [_student_name_tokens(name) for name in authorized_names]
    if mentioned_normalized in authorized_normalized:
        return False
    if any(mentioned_tokens.issubset(tokens) for tokens in authorized_token_sets):
        return False

    for student in repository.list_students():
        student_normalized = _normalize(student.full_name)
        if student_normalized in authorized_normalized:
            continue
        student_tokens = _student_name_tokens(student.full_name)
        full_match = len(mentioned_tokens) >= 2 and (
            mentioned_normalized in student_normalized or student_normalized in mentioned_normalized
        )
        token_match = mentioned_tokens.issubset(student_tokens)
        if full_match or token_match:
            return True
    return False


def _student_name_tokens(full_name: str) -> set[str]:
    return {token for token in _normalize(full_name).split() if len(token) >= 2}


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold()).strip()


def _message_tokens(message: str) -> set[str]:
    return set(re.findall(r"[\wÀ-ỹ]+", _normalize(message), flags=re.UNICODE))
