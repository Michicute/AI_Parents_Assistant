import json
from dataclasses import dataclass
from typing import Any

from app.models.domain import AiInsight, Principal
from app.services.ai_provider import get_llm_provider
from app.services.repositories import repository


ASSESSMENT_PROGRESS_INSIGHT = "assessment_progress"


@dataclass
class AssessmentInsightResult:
    status: str
    insight: AiInsight | None
    draft: dict[str, Any] | None = None
    error: str | None = None


def generate_assessment_progress_insight(
    *,
    principal: Principal,
    student_id: str,
    assessment_id: str,
) -> AssessmentInsightResult:
    try:
        latest_summary = repository.get_assessment_summary_for_student(student_id, assessment_id)
        if not latest_summary["assessments"]:
            return AssessmentInsightResult(status="skipped", insight=None, error="No graded assessment data found")

        latest_assessment = latest_summary["assessments"][0]
        if not latest_assessment.get("is_finalized"):
            return AssessmentInsightResult(status="skipped", insight=None, error="Assessment has not been finalized by a teacher")
        latest_skills = sorted({question["skill"] for question in latest_assessment["questions"]})
        parent_language = repository.get_primary_parent_language_for_student(student_id)
        latest_questions = [
            {
                "question_id": question["question_id"],
                "question_text": question["question_text"],
                "expected_answer": question["expected_answer"],
                "skill": question["skill"],
                "score_awarded": question["score_awarded"],
                "max_score": question["max_score"],
                "student_answer": question["student_answer"],
                "teacher_feedback": question["teacher_feedback"],
                "rubric_criteria": question["rubric_criteria"],
            }
            for question in latest_assessment["questions"]
        ]
        historical = _historical_same_skill_context(
            student_id=student_id,
            assessment_id=assessment_id,
            latest_skills=set(latest_skills),
        )
        recent_trend = _recent_assessment_trend_context(student_id=student_id, assessment_id=assessment_id)
        payload = {
            "student_id": student_id,
            "assessment_id": assessment_id,
            "parent_language": parent_language,
            "latest_skills": latest_skills,
            "latest_assessment": {
                "title": latest_assessment["title"],
                "total_score": latest_assessment["total_score"],
                "max_score": latest_assessment["max_score"],
                "skill_summary": latest_summary["skill_summary"],
                "questions": latest_questions,
            },
            "recent_assessment_trend": recent_trend,
            "historical_same_skill": historical,
            "historical_weaknesses": [
                f"{item['skill']}: {item['percent']}%"
                for item in historical
                if item["percent"] is not None and item["percent"] < 70
            ],
        }
        provider_result = get_llm_provider().generate_assessment_progress_insight(payload)
        content = json.dumps(
            {
                "status": "generated",
                **provider_result,
            },
            ensure_ascii=False,
        )
        draft = {
            "student_id": student_id,
            "assessment_id": assessment_id,
            "insight_type": ASSESSMENT_PROGRESS_INSIGHT,
            "content": content,
            "retrieved_context": [
                {
                    "assessment_id": assessment_id,
                    "question_ids": [question["question_id"] for question in latest_assessment["questions"]],
                    "questions": [
                        {
                            "question_id": question["question_id"],
                            "question_text": question["question_text"],
                            "expected_answer": question["expected_answer"],
                            "skill": question["skill"],
                        }
                        for question in latest_assessment["questions"]
                    ],
                    "skills": latest_skills,
                    "latest_skill_summary": latest_summary["skill_summary"],
                    "recent_assessment_trend": recent_trend,
                    "historical_same_skill": historical,
                    "parent_language": parent_language,
                }
            ],
            "safety_notes": [
                "Generated from authorized structured assessment data only.",
                "Expected answers are used only for approved assessment insight generation.",
                "Does not provide replacement answers.",
            ],
        }
        return AssessmentInsightResult(status="pending_approval", insight=None, draft=draft)
    except Exception as exc:
        return AssessmentInsightResult(status="failed", insight=None, draft=None, error=str(exc))


def approve_assessment_progress_insight(
    *,
    principal: Principal,
    student_id: str,
    assessment_id: str | None,
    content: str,
    retrieved_context: list[dict],
    safety_notes: list[str],
) -> AiInsight:
    return repository.create_ai_insight(
        student_id=student_id,
        user_id=principal.user_id,
        assessment_id=assessment_id,
        insight_type=ASSESSMENT_PROGRESS_INSIGHT,
        content=content,
        retrieved_context=retrieved_context,
        safety_notes=[*safety_notes, "Approved by teacher before becoming visible to parents."],
    )


def _historical_same_skill_context(*, student_id: str, assessment_id: str, latest_skills: set[str]) -> list[dict[str, Any]]:
    summary = repository.get_assessment_summary_for_student(student_id)
    by_skill: dict[str, dict[str, Any]] = {
        skill: {"skill": skill, "score": 0.0, "max_score": 0.0, "answered": 0, "assessment_count": 0}
        for skill in latest_skills
    }
    for assessment in summary["assessments"]:
        if not assessment.get("is_finalized"):
            continue
        if assessment["id"] == assessment_id:
            continue
        seen_in_assessment: set[str] = set()
        for question in assessment["questions"]:
            skill = question["skill"]
            if skill not in by_skill:
                continue
            by_skill[skill]["max_score"] += question["max_score"]
            by_skill[skill]["answered"] += 1
            if question["score_awarded"] is not None:
                by_skill[skill]["score"] += question["score_awarded"]
            seen_in_assessment.add(skill)
        for skill in seen_in_assessment:
            by_skill[skill]["assessment_count"] += 1
    result = []
    for item in by_skill.values():
        max_score = item["max_score"]
        result.append(
            {
                **item,
                "score": round(item["score"], 2),
                "max_score": round(max_score, 2),
                "percent": round(item["score"] / max_score * 100, 1) if max_score else None,
            }
        )
    return result


def _recent_assessment_trend_context(*, student_id: str, assessment_id: str) -> list[dict[str, Any]]:
    assessments = repository.get_recent_assessment_trend_for_student(student_id, assessment_id, limit=2)
    approved_insights = repository.get_ai_insights_for_student(student_id, ASSESSMENT_PROGRESS_INSIGHT)
    insight_by_assessment = {insight.assessment_id: insight for insight in approved_insights if insight.assessment_id}
    trend = []
    for assessment in assessments:
        insight = insight_by_assessment.get(assessment["id"])
        trend.append(
            {
                "assessment_id": assessment["id"],
                "title": assessment["title"],
                "assessment_date": assessment["assessment_date"],
                "created_at": assessment.get("created_at"),
                "total_score": assessment["total_score"],
                "max_score": assessment["max_score"],
                "skill_summary": _skill_summary_for_assessment(assessment),
                "questions": [
                    {
                        "question_id": question["question_id"],
                        "question_text": question["question_text"],
                        "expected_answer": question["expected_answer"],
                        "skill": question["skill"],
                        "score_awarded": question["score_awarded"],
                        "max_score": question["max_score"],
                        "student_answer": question["student_answer"],
                        "teacher_feedback": question["teacher_feedback"],
                    }
                    for question in assessment["questions"]
                ],
                "approved_insight_summary": _insight_summary(insight.content) if insight else None,
            }
        )
    return trend


def _skill_summary_for_assessment(assessment: dict[str, Any]) -> dict[str, dict[str, Any]]:
    if not assessment.get("is_finalized"):
        return {}
    by_skill: dict[str, dict[str, Any]] = {}
    for question in assessment["questions"]:
        skill = question["skill"]
        item = by_skill.setdefault(skill, {"score": 0.0, "max_score": 0.0, "answered": 0})
        item["max_score"] += question["max_score"]
        item["answered"] += 1
        if question["score_awarded"] is not None:
            item["score"] += question["score_awarded"]
    return {
        skill: {
            "score": round(item["score"], 2),
            "max_score": round(item["max_score"], 2),
            "percent": round(item["score"] / item["max_score"] * 100, 1) if item["max_score"] else None,
            "answered": item["answered"],
        }
        for skill, item in by_skill.items()
    }


def _insight_summary(content: str) -> str | None:
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return None
    summary = parsed.get("summary")
    return summary if isinstance(summary, str) else None
