import json
from pydantic import BaseModel, Field
from openai import OpenAI, OpenAIError

from app.core.config import get_settings
from app.models.domain import Intent
from app.services.ai_provider import parse_llm_json


INTENT_CONFIDENCE_THRESHOLD = 0.6


class IntentRoutingResult(BaseModel):
    primary_intent: Intent
    intents: list[Intent] = Field(min_length=1)
    confidence: float = Field(ge=0, le=1)
    needs_clarification: bool = False
    clarification_question: str | None = None
    used_fallback: bool = False


class IntentRoutingError(Exception):
    pass


class StudentNameExtractionResult(BaseModel):
    mentioned_student_names: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    needs_review: bool = False


class StudentNameExtractionError(Exception):
    pass


_INTENT_RULES: tuple[tuple[Intent, tuple[str, ...]], ...] = (
    (
        Intent.assessment_summary,
        ("assessment", "test", "exam", "quiz", "bài kiểm tra", "điểm mạnh", "điểm yếu", "bài thi", "yếu", "mạnh", "strength", "weakness","strong", "weak"),
    ),
    (
        Intent.student_progress,
        (
            "progress",
            "improving",
            "skill",
            "score",
            "bảng điểm",
            "điểm số",
            "xu hướng điểm",
            "điểm ",
            "điểm của",
            "điểm chi tiết",
            "tình hình học tập",
            "học tập của con",
            "con tôi học",
            "con học",
            "dạo này học thế nào",
            "dao nay hoc the nao",
            "dạo này thế nào",
            "dao nay the nao",
            "tiến bộ",
            "tien bo",
            "sa sút",
            "sa sut",
            "kết quả học",
            "ket qua hoc",
            "khả năng tiếng anh",
            "kha nang tieng anh",
            "kỹ năng tiếng anh",
            "ky nang tieng anh",
            "điểm yếu",
            "yếu",
            "điểm mạnh",
            "mạnh",
            "strength",
            "strong",
            "weak",
            "weakness"

        ),
    ),
    (
        Intent.attendance_summary,
        ("điểm danh", "chuyên cần", "đi học đầy đủ", "đi học đủ", "attendance", "absent", "absence"),
    ),
    (Intent.assignment_status, ("assignment", "homework", "due", "bài tập", "hạn nộp", "chưa làm")),
    (Intent.schedule, ("schedule", "class time", "calendar", "lịch học", "giờ học")),
    (
        Intent.course_information,
        (
            "course description",
            "course detail",
            "course information",
            "current course",
            "khóa học",
            "khoá học",
            "chi tiết khóa",
            "chi tiết khoá",
            "chương trình học",
            "nội dung khóa",
            "nội dung khoá",
        ),
    ),
    (
        Intent.announcement,
        (
            "announcement",
            "event",
            "workshop",
            "parent meeting",
            "sự kiện",
            "họp phụ huynh",
            "lịch học bù",
            "nghỉ lễ",
            "sắp tới",
        ),
    ),
    (Intent.parent_handbook, ("handbook", "hỗ trợ", "ở nhà", "luyện tập", "phụ huynh nên", "giúp con")),
    (
        Intent.center_policy,
        (
            "policy",
            "rule",
            "faq",
            "xin phép",
            "nghỉ học",
            "nghi hoc",
            "nghỉ có cần",
        ),
    ),
    (Intent.teacher_contact, ("teacher", "contact", "giáo viên", "liên hệ")),
)


def route_intents_by_rules(message: str) -> list[Intent]:
    text = message.casefold()
    intents = [intent for intent, terms in _INTENT_RULES if any(term in text for term in terms)]
    incomplete_work_terms = ("chưa làm", "chưa nộp", "còn bài", "not submitted", "not started", "incomplete")
    if Intent.assignment_status in intents and any(term in text for term in incomplete_work_terms):
        intents = [intent for intent in intents if intent != Intent.assessment_summary]
    permission_terms = ("absence permission", "permission to miss", "xin phép nghỉ", "nghỉ có cần")
    if Intent.center_policy in intents and any(term in text for term in permission_terms):
        intents = [intent for intent in intents if intent != Intent.attendance_summary]
    return intents


def route_intent(message: str) -> Intent:
    intents = route_intents_by_rules(message)
    return intents[0] if intents else Intent.general_parent_support


def route_intents(message: str, locale: str | None = None) -> IntentRoutingResult:
    rule_intents = route_intents_by_rules(message)
    if rule_intents:
        return IntentRoutingResult(
            primary_intent=rule_intents[0],
            intents=rule_intents,
            confidence=1.0,
        )

    try:
        result = OpenAIIntentClassifier().classify(message, locale)
    except IntentRoutingError:
        return IntentRoutingResult(
            primary_intent=Intent.general_parent_support,
            intents=[Intent.general_parent_support],
            confidence=1.0,
            used_fallback=True,
        )

    if result.needs_clarification or result.confidence < INTENT_CONFIDENCE_THRESHOLD:
        return result.model_copy(
            update={
                "needs_clarification": True,
                "clarification_question": result.clarification_question or _default_clarification_question(locale),
            }
        )
    return result


class OpenAIIntentClassifier:
    def classify(self, message: str, locale: str | None = None) -> IntentRoutingResult:
        settings = get_settings()
        use_local_llm = settings.ai_provider.casefold() == "qwen_local"
        api_key = settings.local_llm_api_key if use_local_llm else settings.openai_api_key
        model = settings.resolved_local_llm_router_model if use_local_llm else settings.openai_model
        base_url = settings.local_llm_base_url if use_local_llm else None
        if not api_key or api_key.startswith("replace-with-"):
            required_key = "LOCAL_LLM_API_KEY" if use_local_llm else "OPENAI_API_KEY"
            raise IntentRoutingError(f"{required_key} is required for intent routing")

        client = OpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=settings.openai_timeout_seconds,
            max_retries=settings.openai_max_retries,
        )
        try:
            response = client.chat.completions.create(
                model=model,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": _classifier_system_prompt(),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "message": message,
                                "locale": locale,
                                "allowed_intents": [intent.value for intent in _allowed_intents()],
                            },
                            ensure_ascii=False,
                        ),
                    },
                ],
            )
        except OpenAIError as exc:
            raise IntentRoutingError("OpenAI intent routing failed") from exc

        try:
            payload = parse_llm_json(response.choices[0].message.content or "{}")
            return _routing_result_from_payload(payload, locale)
        except (AttributeError, KeyError, TypeError, ValueError) as exc:
            raise IntentRoutingError("OpenAI intent routing returned invalid JSON") from exc


class OpenAIStudentNameExtractor:
    def extract(
        self,
        message: str,
        *,
        authorized_student_names: list[str],
        locale: str | None = None,
    ) -> StudentNameExtractionResult:
        settings = get_settings()
        use_local_llm = settings.ai_provider.casefold() == "qwen_local"
        api_key = settings.local_llm_api_key if use_local_llm else settings.openai_api_key
        model = settings.resolved_local_llm_router_model if use_local_llm else settings.openai_model
        base_url = settings.local_llm_base_url if use_local_llm else None
        if not api_key or api_key.startswith("replace-with-"):
            required_key = "LOCAL_LLM_API_KEY" if use_local_llm else "OPENAI_API_KEY"
            raise StudentNameExtractionError(f"{required_key} is required for student-name extraction")

        client = OpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=settings.openai_timeout_seconds,
            max_retries=settings.openai_max_retries,
        )
        try:
            response = client.chat.completions.create(
                model=model,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": _student_name_extractor_system_prompt(),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "message": message,
                                "locale": locale,
                                "authorized_student_names": authorized_student_names,
                            },
                            ensure_ascii=False,
                        ),
                    },
                ],
            )
        except OpenAIError as exc:
            raise StudentNameExtractionError("OpenAI student-name extraction failed") from exc

        try:
            payload = parse_llm_json(response.choices[0].message.content or "{}")
            return _student_name_result_from_payload(payload)
        except (AttributeError, KeyError, TypeError, ValueError) as exc:
            raise StudentNameExtractionError("OpenAI student-name extraction returned invalid JSON") from exc


def _routing_result_from_payload(payload: dict, locale: str | None) -> IntentRoutingResult:
    raw_intents = payload.get("intents")
    if not isinstance(raw_intents, list) or not raw_intents:
        raise ValueError("intents must be a non-empty list")

    intents: list[Intent] = []
    for value in raw_intents:
        intent = Intent(value)
        if intent not in intents:
            intents.append(intent)

    primary_value = payload.get("primary_intent") or intents[0].value
    primary_intent = Intent(primary_value)
    if primary_intent not in intents:
        intents.insert(0, primary_intent)

    confidence = float(payload.get("confidence", 0))
    needs_clarification = bool(payload.get("needs_clarification", False))
    clarification_question = payload.get("clarification_question")
    if clarification_question is not None and not isinstance(clarification_question, str):
        clarification_question = None

    return IntentRoutingResult(
        primary_intent=primary_intent,
        intents=intents,
        confidence=max(0.0, min(1.0, confidence)),
        needs_clarification=needs_clarification,
        clarification_question=clarification_question or (_default_clarification_question(locale) if needs_clarification else None),
    )


def _student_name_result_from_payload(payload: dict) -> StudentNameExtractionResult:
    raw_names = payload.get("mentioned_student_names", [])
    if not isinstance(raw_names, list):
        raise ValueError("mentioned_student_names must be a list")
    names = []
    for name in raw_names:
        if isinstance(name, str):
            stripped = name.strip()
            if stripped and stripped not in names:
                names.append(stripped)
    confidence = float(payload.get("confidence", 0))
    return StudentNameExtractionResult(
        mentioned_student_names=names,
        confidence=max(0.0, min(1.0, confidence)),
        needs_review=bool(payload.get("needs_review", False)),
    )


def _allowed_intents() -> list[Intent]:
    return [
        Intent.student_progress,
        Intent.assignment_status,
        Intent.attendance_summary,
        Intent.schedule,
        Intent.course_information,
        Intent.center_policy,
        Intent.parent_handbook,
        Intent.announcement,
        Intent.teacher_contact,
        Intent.assessment_summary,
    ]


def _classifier_system_prompt() -> str:
    return (
        "You classify parent chat messages for an English Learning Center backend. "
        "Return only JSON with keys: primary_intent string, intents string array, confidence number 0..1, "
        "needs_clarification boolean, clarification_question string or null. "
        "You may return multiple intents when the message asks multiple independent questions. "
        "Use only these intents: student_progress, assignment_status, attendance_summary, schedule, course_information, center_policy, "
        "parent_handbook, announcement, teacher_contact, assessment_summary. "
        "Intent meanings: student_progress=learning progress, skill scores, strengths, weaknesses, learning trends; "
        "assignment_status=homework or assignment completion/status/deadlines; "
        "attendance_summary=attendance history, absence records, punctuality, whether the child attended; "
        "schedule=class time/calendar/next class; "
        "course_information=details about the authorized student's current course, CEFR level, goals, modules, classroom experience, assessment, and parent support; "
        "center_policy=center rules, FAQ, and absence permission rules; "
        "parent_handbook=parent handbook guidance, home support, learning routines, practice strategies, how parents can help students; "
        "announcement=upcoming events, parent meetings, workshops, make-up class announcements, closures, holiday notices, schedule-change announcements; "
        "teacher_contact=teacher feedback/contact; "
        "assessment_summary=tests/exams/quizzes/assessment results; "
        "For absence permission or whether a parent must ask permission to miss class, use center_policy. "
        "For absence/attendance records or whether the student attended, use attendance_summary. "
        "For questions about the child's current course, course content, course goals, or CEFR program details, use course_information. "
        "For upcoming events, parent meetings, workshops, closures, holidays, schedule changes, or make-up class announcements, use announcement. "
        "For parent support questions about how to help a child at home, use parent_handbook. "
        "For mixed questions, include all relevant intents and choose the first major topic as primary_intent. "
        "For questions about their children's academic performance, include both assessment_summary and student_progress to create the answer. "
        "For example, in 'tình hình học tập của Minh', include both assessment_summary and student_progress to create the answer. "
        "When the parent asks how to support learning based on weaknesses or assessment results, include parent_handbook too. "
        "If the message is too unclear to route safely, set needs_clarification=true and ask the parent to rewrite "
        "or specify the question more clearly. Remember to ask the parent in the language they are using."
    )


def _student_name_extractor_system_prompt() -> str:
    return (
        "You extract student names mentioned in a parent message for an English Learning Center. "
        "Return only JSON with keys: mentioned_student_names string array, confidence number 0..1, needs_review boolean. "
        "Extract only names that appear to refer to students or children being asked about. "
        "Do not treat ordinary Vietnamese verbs or sentence-start words as names. "
        "For example, in 'Đi học có đầy đủ không?' extract no names. "
        "The authorized_student_names list is provided only to help identify allowed child names; it is not a complete roster. "
        "Do not decide authorization. Do not invent names that are not in the message."
    )


def _default_clarification_question(locale: str | None = None) -> str:
    if locale and locale.casefold().startswith("en"):
        return "Could you rewrite the question more clearly or specify which topic you want help with?"
    return "Bạn có thể viết lại câu hỏi rõ hơn hoặc nói cụ thể bạn muốn hỏi về nội dung nào không?"
