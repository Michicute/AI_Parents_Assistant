import asyncio
from pathlib import Path

from evals.models import EvalCase, EvalResult
from evals.report import metric_statistics, render_metrics_markdown, summarize_teacher_reviews
from evals.run import document_contexts, grounding_contexts, load_cases, run_deterministic
from evals.scorers import content_scores, summarize
from evals.ragas_evaluator import (
    ANSWER_RELEVANCY_INSTRUCTION,
    FAITHFULNESS_NLI_INSTRUCTION,
    FAITHFULNESS_STATEMENT_INSTRUCTION,
    MedianAnswerRelevancy,
    RAG_CASE_GATE_FLOORS,
    assert_independent_judge,
    configure_judge_parameters,
)


DATASET = Path(__file__).resolve().parents[1] / "evals" / "datasets" / "deterministic.jsonl"
ONLINE_CHAT_DATASET = DATASET.with_name("online_chat.jsonl")
ONLINE_INSIGHT_DATASET = DATASET.with_name("online_insights.jsonl")


def test_deterministic_eval_dataset_has_unique_runnable_cases():
    cases = load_cases([DATASET])
    results = [run_deterministic(case) for case in cases]

    assert len(cases) >= 15
    assert len({case.id for case in cases}) == len(cases)
    assert all(result.passed for result in results), [result.to_dict() for result in results if not result.passed]


def test_eval_summary_fails_release_gate_for_critical_failure():
    result = EvalResult(
        case_id="security-leak",
        suite="security",
        kind="chat",
        passed=False,
        critical=True,
        latency_ms=10,
        scores={},
        failures=["cross-student leakage"],
    )

    summary = summarize([result])

    assert summary["release_gate_passed"] is False
    assert summary["critical_failures"] == ["security-leak"]


def test_teacher_review_summary(tmp_path):
    review = tmp_path / "teacher-review.csv"
    review.write_text(
        "case_id,kind,response_preview,automated_scores,correctness_1_5,clarity_1_5,relevance_1_5,actionability_1_5,tone_1_5,"
        "academic_integrity_1_5,major_edit_required_yes_no,comments\n"
        "chat-1,chat,response one,{},5,4,5,4,5,5,no,good\n"
        "chat-2,chat,response two,{},3,4,4,3,4,5,yes,revise\n",
        encoding="utf-8",
    )

    summary = summarize_teacher_reviews(review)

    assert summary["reviewed_cases"] == 2
    assert summary["correctness_1_5"] == 4
    assert summary["overall_1_5"] == 4.25
    assert summary["major_edit_rate"] == 0.5


def test_online_datasets_have_requested_case_counts():
    chat_cases = load_cases([ONLINE_CHAT_DATASET])
    insight_cases = load_cases([ONLINE_INSIGHT_DATASET])

    assert len(chat_cases) == 21
    assert len([case for case in chat_cases if case.scorer == "ragas"]) == 8
    assert len(insight_cases) == 6
    assert all(case.assessment_id for case in insight_cases)

    prompt_injection = next(case for case in chat_cases if case.id == "safety_prompt_injection")
    assert prompt_injection.expected_status == 200
    assert prompt_injection.expected_intents == ["general_parent_support"]


def test_course_a2_reference_matches_concise_course_response_contract():
    cases = load_cases([ONLINE_CHAT_DATASET])
    course_case = next(case for case in cases if case.id == "rag_course_a2")

    assert "A2 Elementary" in str(course_case.reference)
    assert "văn bản ngắn" in str(course_case.reference)
    assert "ngữ pháp cốt lõi" not in str(course_case.reference)
    assert "chuẩn bị cho B1" not in str(course_case.reference)


def test_eval_summary_enforces_ragas_average_gate():
    result = EvalResult(
        case_id="rag-low",
        suite="rag",
        kind="chat",
        passed=True,
        critical=False,
        latency_ms=10,
        scores={"ragas_faithfulness": 0.79},
    )

    summary = summarize([result])

    assert summary["release_gate_passed"] is False
    assert summary["aggregate_failures"] == ["ragas_faithfulness average below 0.80"]


def test_eval_summary_uses_answer_relevancy_as_release_gate():
    passing_relevancy = EvalResult(
        case_id="rag-relevancy-pass",
        suite="rag",
        kind="chat",
        passed=True,
        critical=False,
        latency_ms=10,
        scores={"ragas_answer_relevancy": 0.80},
    )
    failing_relevancy = EvalResult(
        case_id="rag-relevancy-fail",
        suite="rag",
        kind="chat",
        passed=True,
        critical=False,
        latency_ms=10,
        scores={"ragas_answer_relevancy": 0.79},
    )

    assert summarize([passing_relevancy])["aggregate_failures"] == []
    assert summarize([failing_relevancy])["aggregate_failures"] == [
        "ragas_answer_relevancy average below 0.80"
    ]
    assert RAG_CASE_GATE_FLOORS["ragas_answer_relevancy"] == 0.60


def test_judge_model_must_differ_from_generation_model(monkeypatch):
    monkeypatch.setenv("OPENAI_MODEL", "same-model")
    monkeypatch.setenv("EVAL_JUDGE_MODEL", "same-model")

    try:
        assert_independent_judge()
    except RuntimeError as exc:
        assert "must differ" in str(exc)
    else:
        raise AssertionError("Expected identical judge and generation models to fail")


def test_content_scores_accept_localized_fact_alternatives():
    case = EvalCase(
        id="localized-room",
        suite="structured",
        kind="chat",
        required_fact_groups=[["Room 3", "phòng 3"]],
    )

    scores, failures = content_scores(case, "Lịch học diễn ra tại phòng 3.")

    assert failures == []
    assert scores["required_fact_groups_clear"] is True


def test_content_scores_treat_zero_padded_and_plain_hours_as_equal():
    case = EvalCase(
        id="schedule-time",
        suite="structured",
        kind="chat",
        required_facts=["09:00", "10:30"],
    )

    scores, failures = content_scores(case, "Lớp học từ 9:00 đến 10:30 sáng.")

    assert failures == []
    assert scores["required_fact_coverage"] == 1.0


def test_gpt_5_point_release_uses_completion_token_parameter():
    class FakeLLM:
        model_args = {"max_tokens": 1024, "top_p": 0.1, "temperature": 0.01}

    llm = FakeLLM()
    configure_judge_parameters(llm, "gpt-5.4-mini-2026-03-17")

    assert llm.model_args == {"max_completion_tokens": 4096, "temperature": 1.0}


def test_answer_relevancy_judge_keeps_response_language():
    assert "same language as the response" in ANSWER_RELEVANCY_INSTRUCTION
    assert "never translate" in ANSWER_RELEVANCY_INSTRUCTION


def test_answer_relevancy_uses_median_of_three_independent_scores():
    class Result:
        def __init__(self, value: float) -> None:
            self.value = value

    class FakeMetric:
        prompt = object()

        def __init__(self) -> None:
            self.values = iter([0.2, 0.9, 0.8])

        async def ascore(self, *, user_input: str, response: str) -> Result:
            return Result(next(self.values))

    result = asyncio.run(
        MedianAnswerRelevancy(FakeMetric(), samples=3).ascore(
            user_input="Quy định đi muộn là gì?",
            response="Học viên được xem là muộn sau mười phút.",
        )
    )

    assert result.value == 0.8




def test_ragas_uses_only_unstructured_document_context():
    contexts = [
        "Authorized student: Minh Nguyen (A2).",
        "Authorized active course from structured enrollment records: A2.",
        "Center Policies (center_policy): Parents should notify the center before an absence.",
    ]

    assert document_contexts(contexts) == [contexts[2]]
    assert grounding_contexts(contexts) == contexts


def test_faithfulness_judge_supports_cross_language_grounding():
    assert "same language as the answer" in FAITHFULNESS_STATEMENT_INSTRUCTION
    assert "Compare meaning across languages" in FAITHFULNESS_NLI_INSTRUCTION
    assert "Do not require literal token overlap" in FAITHFULNESS_NLI_INSTRUCTION


def test_metrics_markdown_includes_accuracy_and_ragas_thresholds():
    results = [
        {"scores": {"intent_exact_match": True, "ragas_faithfulness": 0.75}},
        {"scores": {"intent_exact_match": False, "ragas_faithfulness": 0.85}},
    ]
    statistics = {item["metric"]: item for item in metric_statistics(results)}
    payload = {
        "metadata": {"suite": "online", "model": "generation", "judge_model": "judge"},
        "summary": {"pass_rate": 0.5, "release_gate_passed": False},
        "results": results,
    }

    markdown = render_metrics_markdown(payload)

    assert statistics["intent_exact_match"]["average"] == 0.5
    assert statistics["intent_exact_match"]["status"] == "FAIL"
    assert statistics["ragas_faithfulness"]["average"] == 0.8
    assert statistics["ragas_faithfulness"]["status"] == "PASS"
    assert "`ragas_faithfulness`" in markdown
