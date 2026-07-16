from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from typing import Any

from evals.models import EvalCase, EvalResult


RAGAS_AVERAGE_TARGETS = {
    "ragas_faithfulness": 0.80,
    "ragas_answer_relevancy": 0.80,
    "ragas_context_precision": 0.80,
    "ragas_context_recall": 0.80,
}


def normalize(value: str) -> str:
    normalized = " ".join(value.casefold().split())
    return re.sub(r"(?<!\d)0(\d):([0-5]\d)\b", r"\1:\2", normalized)


def estimate_tokens(value: Any) -> int:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return max(1, math.ceil(len(text) / 4))


def content_scores(case: EvalCase, output: str) -> tuple[dict[str, float | bool], list[str]]:
    normalized = normalize(output)
    required_hits = [normalize(item) in normalized for item in case.required_facts]
    required_group_hits = [
        any(normalize(alternative) in normalized for alternative in group)
        for group in case.required_fact_groups
    ]
    forbidden_hits = [normalize(item) in normalized for item in case.forbidden_facts]
    required_coverage = sum(required_hits) / len(required_hits) if required_hits else 1.0
    forbidden_clear = not any(forbidden_hits)
    failures = []
    if required_coverage < 1:
        missing = [item for item, hit in zip(case.required_facts, required_hits) if not hit]
        failures.append(f"missing required facts: {missing}")
    if not all(required_group_hits):
        missing_groups = [group for group, hit in zip(case.required_fact_groups, required_group_hits, strict=True) if not hit]
        failures.append(f"missing required fact alternatives: {missing_groups}")
    if not forbidden_clear:
        present = [item for item, hit in zip(case.forbidden_facts, forbidden_hits) if hit]
        failures.append(f"forbidden facts present: {present}")
    return {
        "required_fact_coverage": round(required_coverage, 4),
        "required_fact_groups_clear": all(required_group_hits),
        "forbidden_fact_clear": forbidden_clear,
    }, failures


def exact_intent_score(expected: list[str], actual: list[str]) -> tuple[bool, list[str]]:
    expected_set = set(expected)
    actual_set = set(actual)
    if expected_set == actual_set:
        return True, []
    return False, [f"intent mismatch: expected={sorted(expected_set)} actual={sorted(actual_set)}"]


def estimate_cost(
    input_tokens: int,
    output_tokens: int,
    input_price_per_million: float | None,
    output_price_per_million: float | None,
) -> float | None:
    if input_price_per_million is None or output_price_per_million is None:
        return None
    return round(
        input_tokens * input_price_per_million / 1_000_000
        + output_tokens * output_price_per_million / 1_000_000,
        8,
    )


def summarize(results: list[EvalResult]) -> dict[str, Any]:
    by_suite: dict[str, list[EvalResult]] = defaultdict(list)
    for result in results:
        by_suite[result.suite].append(result)

    suites = {}
    for suite, items in sorted(by_suite.items()):
        latencies = sorted(item.latency_ms for item in items)
        suites[suite] = {
            "cases": len(items),
            "passed": sum(item.passed for item in items),
            "pass_rate": round(sum(item.passed for item in items) / len(items), 4),
            "p50_latency_ms": percentile(latencies, 0.5),
            "p95_latency_ms": percentile(latencies, 0.95),
        }

    critical_failures = [result.case_id for result in results if result.critical and not result.passed]
    metric_values: dict[str, list[float]] = defaultdict(list)
    for result in results:
        for name, value in result.scores.items():
            if name.startswith("ragas_") or name == "insight_rubric_1_5":
                metric_values[name].append(float(value))
    metric_averages = {
        name: round(sum(values) / len(values), 4)
        for name, values in sorted(metric_values.items())
        if values
    }
    aggregate_failures = [
        f"{name} average below {RAGAS_AVERAGE_TARGETS[name]:.2f}"
        for name, value in metric_averages.items()
        if name in RAGAS_AVERAGE_TARGETS and value < RAGAS_AVERAGE_TARGETS[name]
    ]
    if "insight_rubric_1_5" in metric_averages and metric_averages["insight_rubric_1_5"] < 4.0:
        aggregate_failures.append("insight_rubric_1_5 average below 4.0")
    release_gate_passed = bool(results) and not critical_failures and not aggregate_failures and all(result.passed for result in results)
    return {
        "cases": len(results),
        "passed": sum(result.passed for result in results),
        "pass_rate": round(sum(result.passed for result in results) / len(results), 4) if results else 0,
        "critical_failures": critical_failures,
        "release_gate_passed": release_gate_passed,
        "aggregate_failures": aggregate_failures,
        "metric_averages": metric_averages,
        "estimated_cost_usd": round(sum(result.estimated_cost_usd or 0 for result in results), 6),
        "suites": suites,
    }


def percentile(values: list[float], quantile: float) -> float:
    if not values:
        return 0
    index = min(len(values) - 1, math.ceil(len(values) * quantile) - 1)
    return round(values[index], 2)
