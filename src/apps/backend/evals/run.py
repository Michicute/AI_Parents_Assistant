from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from evals.models import EvalCase, EvalResult
from evals.scorers import content_scores, estimate_cost, estimate_tokens, exact_intent_score, summarize


BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET_DIR = Path(__file__).resolve().parent / "datasets"
DEFAULT_RESULTS_DIR = BACKEND_ROOT / "eval-results"
DETERMINISTIC_KINDS = {"intent", "input_guardrail", "output_guardrail", "retrieval_guardrail"}
ONLINE_KINDS = {"chat", "ai_insight"}
RAG_CONTEXT_PATTERN = re.compile(r"\((center_policy|parent_handbook|faq|announcement|course_description)\):", re.IGNORECASE)


def load_cases(paths: list[Path]) -> list[EvalCase]:
    cases: list[EvalCase] = []
    seen: set[str] = set()
    for path in paths:
        with path.open(encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip() or line.lstrip().startswith("#"):
                    continue
                try:
                    case = EvalCase.from_dict(json.loads(line))
                except (TypeError, ValueError, json.JSONDecodeError) as exc:
                    raise ValueError(f"Invalid eval case at {path}:{line_number}: {exc}") from exc
                if case.id in seen:
                    raise ValueError(f"Duplicate eval case id: {case.id}")
                seen.add(case.id)
                cases.append(case)
    return cases


def run_deterministic(case: EvalCase) -> EvalResult:
    from app.services.guardrails import check_input, check_output, check_retrieval
    from app.services.intent_router import route_intents_by_rules

    started = time.perf_counter()
    failures: list[str] = []
    scores: dict[str, float | bool] = {}
    output: Any

    if case.kind == "intent":
        actual = [intent.value for intent in route_intents_by_rules(case.message)]
        exact, failures = exact_intent_score(case.expected_intents, actual)
        scores["intent_exact_match"] = exact
        output = actual
    elif case.kind == "input_guardrail":
        decision = check_input(str(case.input_value or case.message), case.locale)
        output = {"allowed": decision.allowed, "safety_notes": decision.safety_notes, "value": decision.value}
        failures = decision_failures(case, decision.allowed, decision.safety_notes)
        scores["guardrail_expected_decision"] = not failures
    elif case.kind == "output_guardrail":
        decision = check_output(str(case.input_value or case.message), case.locale)
        output = {"allowed": decision.allowed, "safety_notes": decision.safety_notes, "value": decision.value}
        failures = decision_failures(case, decision.allowed, decision.safety_notes)
        scores["guardrail_expected_decision"] = not failures
    elif case.kind == "retrieval_guardrail":
        raw_context = case.input_value if isinstance(case.input_value, list) else []
        decision = check_retrieval(raw_context)
        output = {"allowed": decision.allowed, "safety_notes": decision.safety_notes, "value": decision.value}
        failures = decision_failures(case, decision.allowed, decision.safety_notes)
        output_text = " ".join(str(item) for item in decision.value) if isinstance(decision.value, list) else str(decision.value)
        content, content_failures = content_scores(case, output_text)
        scores.update(content)
        failures.extend(content_failures)
    else:
        raise ValueError(f"Unsupported deterministic kind: {case.kind}")

    return EvalResult(
        case_id=case.id,
        suite=case.suite,
        kind=case.kind,
        passed=not failures,
        critical=case.critical,
        latency_ms=(time.perf_counter() - started) * 1000,
        scores=scores,
        failures=failures,
        output_preview=preview(output),
    )


def run_chat_case(case: EvalCase, client: httpx.Client, token: str, prices: tuple[float | None, float | None]) -> EvalResult:
    started = time.perf_counter()
    response = client.post(
        "/api/ai/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": case.message, "student_id": case.student_id, "locale": case.locale},
    )
    latency_ms = (time.perf_counter() - started) * 1000
    failures: list[str] = []
    scores: dict[str, float | bool] = {}
    if response.status_code != case.expected_status:
        failures.append(f"unexpected HTTP status: expected={case.expected_status} actual={response.status_code}")
        payload: dict[str, Any] = {"detail": response.text[:500]}
    elif response.status_code != 200:
        payload = response.json()
        scores["expected_http_status"] = True
        response_text = json.dumps(payload, ensure_ascii=False)
        content, content_failures = content_scores(case, response_text)
        scores.update(content)
        failures.extend(content_failures)
    else:
        payload = response.json()
        actual_intents = payload.get("intents") or [payload.get("intent")]
        if case.expected_intents:
            exact, intent_failures = exact_intent_score(case.expected_intents, actual_intents)
            scores["intent_exact_match"] = exact
            failures.extend(intent_failures)
        answer = str(payload.get("answer", ""))
        content, content_failures = content_scores(case, answer)
        scores.update(content)
        failures.extend(content_failures)
        retrieved = " ".join(str(item) for item in payload.get("retrieved_context", []))
        source_hits = [source.casefold() in retrieved.casefold() for source in case.expected_sources]
        source_accuracy = sum(source_hits) / len(source_hits) if source_hits else 1.0
        scores["source_accuracy"] = round(source_accuracy, 4)
        if source_accuracy < 1:
            failures.append("missing expected retrieval source")
        if case.scorer == "ragas":
            from evals.ragas_evaluator import RAG_CASE_GATE_FLOORS, score_rag

            rag_contexts = document_contexts(list(payload.get("retrieved_context", [])))
            if not case.reference:
                failures.append("RAGAS case has no curated reference")
            elif not rag_contexts:
                failures.append("No RAG document context was retrieved")
            else:
                try:
                    ragas_scores = score_rag(
                        user_input=case.message,
                        response=answer,
                        contexts=rag_contexts,
                        reference=case.reference,
                        faithfulness_contexts=grounding_contexts(list(payload.get("retrieved_context", []))),
                    )
                except Exception as exc:
                    failures.append(f"RAGAS judge error: {type(exc).__name__}: {exc}")
                else:
                    scores.update(ragas_scores)
                    below_floor = [
                        name
                        for name, value in ragas_scores.items()
                        if name in RAG_CASE_GATE_FLOORS and value < RAG_CASE_GATE_FLOORS[name]
                    ]
                    if below_floor:
                        thresholds = {name: RAG_CASE_GATE_FLOORS[name] for name in below_floor}
                        failures.append(f"RAGAS metrics below case floors {thresholds}")

    answer = str(payload.get("answer", ""))
    input_tokens = estimate_tokens({"message": case.message, "context": payload.get("retrieved_context", [])})
    output_tokens = estimate_tokens(answer)
    return EvalResult(
        case_id=case.id,
        suite=case.suite,
        kind=case.kind,
        passed=not failures,
        critical=case.critical,
        latency_ms=latency_ms,
        scores=scores,
        failures=failures,
        output_preview=preview(answer or payload),
        context_preview=preview(payload.get("retrieved_context", []), limit=1200),
        input_tokens_estimate=input_tokens,
        output_tokens_estimate=output_tokens,
        estimated_cost_usd=estimate_cost(input_tokens, output_tokens, *prices),
    )


def run_insight_case(case: EvalCase, prices: tuple[float | None, float | None]) -> EvalResult:
    from app.models.domain import Principal, Role
    from app.services.assessment_insights import generate_assessment_progress_insight
    from evals.ragas_evaluator import INSIGHT_RUBRIC_FLOOR, score_insight

    if not case.assessment_id:
        raise ValueError(f"AI Insight case {case.id} has no assessment_id")
    started = time.perf_counter()
    generated = generate_assessment_progress_insight(
        principal=Principal(user_id="teacher-1", email="teacher.lan@englishcenter.test", role=Role.teacher, assigned_class_ids=["class-a"]),
        student_id=case.student_id or "student-a",
        assessment_id=case.assessment_id,
    )
    if generated.status != "pending_approval" or not generated.draft:
        raise RuntimeError(f"Insight generation failed: status={generated.status} error={generated.error}")
    output = json.loads(generated.draft["content"])
    latency_ms = (time.perf_counter() - started) * 1000
    output_text = json.dumps(output, ensure_ascii=False)
    scores, failures = content_scores(case, output_text)
    required_keys = {
        "summary",
        "new_strengths",
        "new_weaknesses",
        "improved_weaknesses",
        "persistent_weaknesses",
        "teacher_actions",
        "parent_actions",
        "confidence",
    }
    schema_valid = required_keys.issubset(output)
    scores["schema_valid"] = schema_valid
    if not schema_valid:
        failures.append(f"missing insight keys: {sorted(required_keys - set(output))}")
    contexts = [json.dumps(item, ensure_ascii=False) for item in generated.draft["retrieved_context"]]
    rubric_score, rubric_reason = score_insight(
        response=output_text,
        reference=case.reference or "The insight must accurately reflect the supplied graded assessment evidence.",
        contexts=contexts,
    )
    scores["insight_rubric_1_5"] = rubric_score
    if rubric_score < INSIGHT_RUBRIC_FLOOR:
        failures.append(f"Insight rubric below {INSIGHT_RUBRIC_FLOOR}: {rubric_score}; {rubric_reason or ''}".strip())
    input_tokens = estimate_tokens(contexts)
    output_tokens = estimate_tokens(output)
    return EvalResult(
        case_id=case.id,
        suite=case.suite,
        kind=case.kind,
        passed=not failures,
        critical=case.critical,
        latency_ms=latency_ms,
        scores=scores,
        failures=failures,
        output_preview=preview(output),
        input_tokens_estimate=input_tokens,
        output_tokens_estimate=output_tokens,
        estimated_cost_usd=estimate_cost(input_tokens, output_tokens, *prices),
    )


def decision_failures(case: EvalCase, allowed: bool, notes: list[str]) -> list[str]:
    failures = []
    if case.expected_allowed is not None and allowed != case.expected_allowed:
        failures.append(f"allowed mismatch: expected={case.expected_allowed} actual={allowed}")
    missing_notes = [note for note in case.expected_safety_notes if note not in notes]
    if missing_notes:
        failures.append(f"missing safety notes: {missing_notes}")
    return failures


def document_contexts(contexts: list[str]) -> list[str]:
    return [context for context in contexts if RAG_CONTEXT_PATTERN.search(context)]


def grounding_contexts(contexts: list[str]) -> list[str]:
    return [context.strip() for context in contexts if isinstance(context, str) and context.strip()]


def preview(value: Any, limit: int = 600) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    return text[:limit]


def ensure_online_environment() -> None:
    database_url = os.getenv("EVAL_DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("EVAL_DATABASE_URL is required for online evaluation")
    if "eval" not in database_url.casefold():
        raise RuntimeError("EVAL_DATABASE_URL must clearly identify an isolated eval database")
    runtime_database = os.getenv("DATABASE_URL")
    if runtime_database and runtime_database == database_url and os.getenv("EVAL_ISOLATED", "") != "1":
        raise RuntimeError("EVAL_DATABASE_URL must not equal the current runtime DATABASE_URL")
    from evals.ragas_evaluator import assert_independent_judge

    assert_independent_judge()


def online_client() -> tuple[httpx.Client, str]:
    base_url = os.getenv("EVAL_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
    client = httpx.Client(base_url=base_url, timeout=float(os.getenv("EVAL_TIMEOUT_SECONDS", "30")))
    login = client.post(
        "/api/auth/login",
        json={
            "email": os.getenv("EVAL_PARENT_EMAIL", "parent.minh@englishcenter.test"),
            "password": os.getenv("EVAL_PARENT_PASSWORD", "Evaluation123!"),
        },
    )
    if login.status_code != 200:
        raise RuntimeError(f"Eval login failed with HTTP {login.status_code}: {login.text[:300]}")
    return client, login.json()["access_token"]


def optional_price(name: str) -> float | None:
    value = os.getenv(name)
    return float(value) if value else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Parent AI Assistant evaluation suites")
    parser.add_argument("--suite", choices=["deterministic", "online", "all"], default="deterministic")
    parser.add_argument("--dataset", action="append", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--model", default=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"))
    parser.add_argument("--case-suite", default=os.getenv("EVAL_CASE_SUITE") or None)
    args = parser.parse_args()

    dataset_paths = args.dataset or sorted(DEFAULT_DATASET_DIR.glob("*.jsonl"))
    cases = load_cases(dataset_paths)
    selected_kinds = DETERMINISTIC_KINDS if args.suite == "deterministic" else ONLINE_KINDS
    if args.suite == "all":
        selected_kinds = DETERMINISTIC_KINDS | ONLINE_KINDS
    selected = [case for case in cases if case.kind in selected_kinds]
    if args.case_suite:
        selected = [case for case in selected if case.suite == args.case_suite]
    if not selected:
        raise RuntimeError(f"No cases selected for suite {args.suite}")

    if selected_kinds.intersection(ONLINE_KINDS):
        ensure_online_environment()
    prices = (optional_price("EVAL_INPUT_PRICE_PER_1M"), optional_price("EVAL_OUTPUT_PRICE_PER_1M"))
    results: list[EvalResult] = []
    client: httpx.Client | None = None
    token = ""
    if any(case.kind == "chat" for case in selected):
        client, token = online_client()
    try:
        for case in selected:
            try:
                if case.kind in DETERMINISTIC_KINDS:
                    result = run_deterministic(case)
                elif case.kind == "chat":
                    assert client is not None
                    result = run_chat_case(case, client, token, prices)
                else:
                    result = run_insight_case(case, prices)
            except Exception as exc:
                result = EvalResult(
                    case_id=case.id,
                    suite=case.suite,
                    kind=case.kind,
                    passed=False,
                    critical=case.critical,
                    latency_ms=0,
                    scores={},
                    failures=[f"runner error: {type(exc).__name__}: {exc}"],
                )
            results.append(result)
            print(f"{'PASS' if result.passed else 'FAIL'} {case.id}")
    finally:
        if client is not None:
            client.close()

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    output = args.output or DEFAULT_RESULTS_DIR / f"eval-{args.suite}-{timestamp}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "metadata": {
            "created_at": datetime.now(UTC).isoformat(),
            "suite": args.suite,
            "model": args.model,
            "judge_model": os.getenv("EVAL_JUDGE_MODEL") if selected_kinds.intersection(ONLINE_KINDS) else None,
            "dataset_files": [str(path) for path in dataset_paths],
            "case_suite_filter": args.case_suite,
            "token_counts_are_estimates": True,
        },
        "summary": summarize(results),
        "results": [result.to_dict() for result in results],
    }
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Report: {output}")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    return 0 if report["summary"]["release_gate_passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
