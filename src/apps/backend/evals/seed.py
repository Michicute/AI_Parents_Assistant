from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.db import models as orm
from app.db.session import SessionLocal
from app.db.seed import seed, upsert


SCENARIOS = [
    ("reading", 9.0, "The passage is about recycling.", "The passage explains why recycling matters.", "Uses relevant evidence and identifies the main idea."),
    ("listening", 4.0, "They meet at the library.", "They meet at home.", "Needs more practice listening for place details."),
    ("speaking", 7.0, None, "Student gave a relevant opinion with long pauses.", "Ideas are relevant; practise fluency and extending reasons."),
    ("writing", 5.0, None, "Student listed ideas without clear connections.", "Needs a topic sentence and linking words."),
    ("grammar", 5.0, "went", "go", "Review irregular past-tense forms."),
    ("vocabulary", 8.0, None, "Student used the target word accurately in a sentence.", "Good contextual use; continue collocation practice."),
]


def seed_evaluation_data() -> None:
    seed()
    now = datetime(2026, 6, 20, 9, 0, tzinfo=UTC)
    with SessionLocal() as db:
        upsert(
            db,
            orm.Assessment,
            "eval-assessment-not-started",
            class_id="class-a",
            title="Evaluation Follow-up Check",
            description="Curated not-started assessment for assignment-status evaluation.",
            assessment_date=date(2026, 6, 15),
            created_by_teacher_id="teacher-1",
            created_at=now,
        )
        for index, (skill, score, expected, answer, feedback) in enumerate(SCENARIOS, start=1):
            assessment_id = f"eval-assessment-{skill}"
            question_id = f"eval-question-{skill}"
            upsert(
                db,
                orm.Assessment,
                assessment_id,
                class_id="class-a",
                title=f"Evaluation {skill.title()} Check",
                description=f"Curated {skill} assessment for AI Insight evaluation.",
                assessment_date=date(2026, 6, 1) + timedelta(days=index),
                created_by_teacher_id="teacher-1",
                created_at=now + timedelta(days=index),
            )
            db.flush()
            upsert(
                db,
                orm.AssessmentQuestion,
                question_id,
                assessment_id=assessment_id,
                question_text=f"Evaluate the student's {skill} performance from the submitted work.",
                question_type="essay",
                choices=[],
                expected_answer=expected,
                skill_tag=skill,
                max_score=10,
                position=1,
                rubric_criteria={skill: "Demonstrates the target skill using the supplied evidence."},
                score_range="[0,10]",
                created_at=now + timedelta(days=index),
            )
            db.flush()
            upsert(
                db,
                orm.StudentAnswer,
                f"eval-answer-{skill}",
                student_id="student-a",
                assessment_question_id=question_id,
                answer_text=answer,
                score_awarded=score,
                teacher_feedback=feedback,
                submitted_at=now + timedelta(days=index, hours=1),
            )
            upsert(
                db,
                orm.SkillScore,
                f"eval-skill-score-{skill}",
                student_id="student-a",
                class_id="class-a",
                skill=skill,
                score=score * 10,
                scale="percent",
                assessed_on=date(2026, 6, 1) + timedelta(days=index),
                source=f"assessment:{assessment_id}",
                teacher_id="teacher-1",
                teacher_comment=feedback,
                trend_summary={},
            )
        db.commit()


if __name__ == "__main__":
    seed_evaluation_data()
    print("Evaluation database seeded with 6 graded assessment scenarios.")
