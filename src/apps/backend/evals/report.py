from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


TEACHER_FIELDS = [
    "case_id",
    "kind",
    "response_preview",
    "context_preview",
    "automated_scores",
    "correctness_1_5",
    "clarity_1_5",
    "relevance_1_5",
    "actionability_1_5",
    "tone_1_5",
    "academic_integrity_1_5",
    "major_edit_required_yes_no",
    "comments",
]
RATING_FIELDS = [field for field in TEACHER_FIELDS if field.endswith("_1_5")]
METRIC_DEFINITIONS = {
    "intent_exact_match": (1.0, "Intent routing khớp chính xác tập intent kỳ vọng."),
    "guardrail_expected_decision": (1.0, "Guardrail cho phép hoặc từ chối đúng kỳ vọng."),
    "required_fact_coverage": (1.0, "Tỷ lệ dữ kiện bắt buộc xuất hiện trong response."),
    "required_fact_groups_clear": (1.0, "Response chứa ít nhất một cách diễn đạt hợp lệ trong mỗi nhóm dữ kiện."),
    "forbidden_fact_clear": (1.0, "Response không chứa dữ kiện bị cấm hoặc dữ liệu ngoài quyền."),
    "source_accuracy": (1.0, "Tỷ lệ nguồn dữ liệu kỳ vọng xuất hiện trong retrieved context."),
    "expected_http_status": (1.0, "HTTP status khớp hành vi bảo mật hoặc lỗi được kỳ vọng."),
    "schema_valid": (1.0, "Output AI Insight có đầy đủ schema bắt buộc."),
    "ragas_faithfulness": (0.8, "Mức độ các khẳng định trong câu trả lời được hỗ trợ bởi context."),
    "ragas_answer_relevancy": (0.8, "Mức độ câu trả lời liên quan trực tiếp tới câu hỏi."),
    "ragas_context_precision": (0.8, "Mức độ các context được retrieve có liên quan và được xếp hạng tốt."),
    "ragas_context_recall": (0.8, "Mức độ context retrieve bao phủ thông tin cần thiết trong reference."),
    "insight_rubric_1_5": (4.0, "Chất lượng Insight theo rubric groundedness, clarity, actionability và academic integrity."),
}


def metric_statistics(results: list[dict]) -> list[dict[str, str | int | float]]:
    values_by_metric: dict[str, list[float]] = {}
    for result in results:
        for name, value in result.get("scores", {}).items():
            if isinstance(value, (bool, int, float)):
                values_by_metric.setdefault(name, []).append(float(value))

    statistics = []
    for name, values in sorted(values_by_metric.items()):
        target, description = METRIC_DEFINITIONS.get(name, (1.0, "Automated evaluation metric."))
        average = round(sum(values) / len(values), 4)
        maximum = 5.0 if name.endswith("_1_5") else 1.0
        statistics.append(
            {
                "metric": name,
                "cases": len(values),
                "average": average,
                "scale": f"0-{int(maximum)}" if maximum == 1 else "1-5",
                "target": target,
                "status": "PASS" if average >= target else "FAIL",
                "description": description,
            }
        )
    return statistics


def render_metrics_markdown(payload: dict) -> str:
    metadata = payload["metadata"]
    rows = metric_statistics(payload["results"])
    lines = [
        "# Evaluation Metrics Summary",
        "",
        f"- Suite: `{metadata['suite']}`",
        f"- Generation model: `{metadata['model']}`",
        f"- Judge model: `{metadata.get('judge_model') or 'not used'}`",
        f"- Overall pass rate: {payload['summary']['pass_rate']:.1%}",
        f"- Release gate: **{'PASS' if payload['summary']['release_gate_passed'] else 'FAIL'}**",
        "",
        "| Metric | Cases | Average | Scale | Target | Status | Meaning |",
        "| --- | ---: | ---: | ---: | ---: | --- | --- |",
    ]
    if not rows:
        lines.append("| No automated metrics | 0 | - | - | - | - | - |")
    for row in rows:
        lines.append(
            f"| `{row['metric']}` | {row['cases']} | {row['average']} | {row['scale']} | "
            f">= {row['target']} | **{row['status']}** | {row['description']} |"
        )
    return "\n".join(lines) + "\n"


def summarize_teacher_reviews(path: Path) -> dict[str, float | int]:
    ratings: dict[str, list[float]] = {field: [] for field in RATING_FIELDS}
    reviewed = 0
    major_edits = 0
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            values = [row.get(field, "").strip() for field in RATING_FIELDS]
            if not any(values):
                continue
            reviewed += 1
            for field, value in zip(RATING_FIELDS, values, strict=True):
                if not value:
                    continue
                rating = float(value)
                if not 1 <= rating <= 5:
                    raise ValueError(f"{field} must be between 1 and 5 for case {row.get('case_id')}")
                ratings[field].append(rating)
            if row.get("major_edit_required_yes_no", "").strip().casefold() in {"yes", "y", "true", "1", "có", "co"}:
                major_edits += 1

    summary: dict[str, float | int] = {"reviewed_cases": reviewed}
    for field, values in ratings.items():
        summary[field] = round(sum(values) / len(values), 2) if values else 0.0
    all_ratings = [value for values in ratings.values() for value in values]
    summary["overall_1_5"] = round(sum(all_ratings) / len(all_ratings), 2) if all_ratings else 0.0
    summary["major_edit_rate"] = round(major_edits / reviewed, 4) if reviewed else 0.0
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Render evaluation JSON as Markdown and teacher-review CSV")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--teacher-review", type=Path, help="Completed teacher-review CSV to aggregate")
    args = parser.parse_args()
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    summary = payload["summary"]
    markdown_path = args.input.with_suffix(".md")
    metrics_path = args.input.with_name(f"{args.input.stem}-metrics.md")
    csv_path = args.input.with_name(f"{args.input.stem}-teacher-review.csv")

    lines = [
        "# Evaluation Report",
        "",
        f"- Suite: `{payload['metadata']['suite']}`",
        f"- Model: `{payload['metadata']['model']}`",
        f"- Judge model: `{payload['metadata'].get('judge_model') or 'not used'}`",
        f"- Cases: {summary['cases']}",
        f"- Pass rate: {summary['pass_rate']:.1%}",
        f"- Release gate: **{'PASS' if summary['release_gate_passed'] else 'FAIL'}**",
        f"- Critical failures: {', '.join(summary['critical_failures']) or 'None'}",
        f"- Aggregate failures: {', '.join(summary.get('aggregate_failures', [])) or 'None'}",
        "",
        "## Suites",
        "",
        "| Suite | Cases | Passed | Pass rate | P50 ms | P95 ms |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for suite, item in summary["suites"].items():
        lines.append(
            f"| {suite} | {item['cases']} | {item['passed']} | {item['pass_rate']:.1%} | "
            f"{item['p50_latency_ms']} | {item['p95_latency_ms']} |"
        )
    if summary.get("metric_averages"):
        lines.extend(["", "## Automated Quality Metrics", "", "| Metric | Average |", "| --- | ---: |"])
        for name, value in summary["metric_averages"].items():
            lines.append(f"| {name} | {value} |")
    lines.extend(["", "## Failures", ""])
    failed = [result for result in payload["results"] if not result["passed"]]
    if not failed:
        lines.append("None.")
    for result in failed:
        lines.append(f"- `{result['case_id']}`: {'; '.join(result['failures'])}")
    if args.teacher_review:
        teacher = summarize_teacher_reviews(args.teacher_review)
        lines.extend(
            [
                "",
                "## Teacher Review",
                "",
                f"- Reviewed cases: {teacher['reviewed_cases']}",
                f"- Overall score: {teacher['overall_1_5']}/5",
                f"- Major edit rate: {teacher['major_edit_rate']:.1%}",
                "",
                "| Criterion | Mean score |",
                "| --- | ---: |",
            ]
        )
        for field in RATING_FIELDS:
            lines.append(f"| {field.removesuffix('_1_5').replace('_', ' ').title()} | {teacher[field]}/5 |")
    markdown_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    metrics_path.write_text(render_metrics_markdown(payload), encoding="utf-8")

    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=TEACHER_FIELDS)
        writer.writeheader()
        for result in payload["results"]:
            if result["kind"] in {"chat", "ai_insight"}:
                writer.writerow(
                    {
                        "case_id": result["case_id"],
                        "kind": result["kind"],
                        "response_preview": result["output_preview"],
                        "context_preview": result.get("context_preview", ""),
                        "automated_scores": json.dumps(result["scores"], ensure_ascii=False),
                    }
                )
    print(f"Markdown: {markdown_path}")
    print(f"Metrics summary: {metrics_path}")
    print(f"Teacher review: {csv_path}")


if __name__ == "__main__":
    main()
