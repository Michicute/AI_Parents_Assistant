from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class EvalCase:
    id: str
    suite: str
    kind: str
    locale: str = "vi"
    message: str = ""
    input_value: Any = None
    expected_intents: list[str] = field(default_factory=list)
    expected_allowed: bool | None = None
    expected_safety_notes: list[str] = field(default_factory=list)
    expected_sources: list[str] = field(default_factory=list)
    reference: str | None = None
    reference_contexts: list[str] = field(default_factory=list)
    expected_context_ids: list[str] = field(default_factory=list)
    scorer: str | None = None
    required_facts: list[str] = field(default_factory=list)
    required_fact_groups: list[list[str]] = field(default_factory=list)
    forbidden_facts: list[str] = field(default_factory=list)
    student_id: str | None = None
    expected_status: int = 200
    payload: dict[str, Any] | None = None
    assessment_id: str | None = None
    critical: bool = False

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "EvalCase":
        known = {item.name for item in cls.__dataclass_fields__.values()}
        return cls(**{key: item for key, item in value.items() if key in known})


@dataclass
class EvalResult:
    case_id: str
    suite: str
    kind: str
    passed: bool
    critical: bool
    latency_ms: float
    scores: dict[str, float | bool]
    failures: list[str] = field(default_factory=list)
    output_preview: str = ""
    context_preview: str = ""
    input_tokens_estimate: int | None = None
    output_tokens_estimate: int | None = None
    estimated_cost_usd: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
