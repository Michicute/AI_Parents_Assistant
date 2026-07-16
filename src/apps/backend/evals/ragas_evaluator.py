from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from functools import lru_cache
from statistics import median
from typing import Any

DEFAULT_JUDGE_MODEL = "gpt-5.4-mini-2026-03-17"
RAG_CASE_GATE_FLOORS = {
    "ragas_faithfulness": 0.60,
    "ragas_answer_relevancy": 0.60,
    "ragas_context_precision": 0.60,
    "ragas_context_recall": 0.60,
}
INSIGHT_RUBRIC_FLOOR = 4.0
ANSWER_RELEVANCY_INSTRUCTION = (
    "Generate one question that is answered by the given response and identify whether the response is noncommittal. "
    "The generated question must use the same language as the response; never translate it. Focus on the response's "
    "main factual conclusion rather than secondary details. Give noncommittal as 1 only when the response is evasive, "
    "vague, or ambiguous, otherwise give 0."
)
FAITHFULNESS_STATEMENT_INSTRUCTION = (
    "Given a question and an answer, break every answer sentence into atomic, fully understandable factual statements. "
    "Keep each statement in the same language as the answer and do not add facts or use unresolved pronouns."
)
FAITHFULNESS_NLI_INSTRUCTION = (
    "Judge each statement against the supplied context. Return verdict 1 when the statement can be directly inferred from "
    "the context and 0 otherwise. Compare meaning across languages: a faithful translation or paraphrase is supported even "
    "when the statement and context use different languages or wording. Do not require literal token overlap."
)

INSIGHT_RUBRICS = {
    "score1_description": "The insight contradicts assessment data, exposes answers, or gives unsafe or unusable advice.",
    "score2_description": "The insight has major unsupported claims, misses the main skill evidence, or offers weak actions.",
    "score3_description": "The insight is mostly grounded but has notable omissions, vague skill analysis, or generic actions.",
    "score4_description": "The insight is grounded, parent-friendly, identifies strengths and gaps, and gives useful actions with only minor issues.",
    "score5_description": "The insight is fully grounded in the supplied assessment context, precisely identifies strengths and gaps, gives practical teacher and parent actions, preserves academic integrity, and is exceptionally clear.",
}


@dataclass(frozen=True)
class MedianMetricResult:
    value: float


class MedianAnswerRelevancy:
    """Aggregate independent one-question RAGAS relevancy scores by median."""

    def __init__(self, metric: Any, samples: int = 3) -> None:
        if samples < 1 or samples % 2 == 0:
            raise ValueError("Median answer relevancy requires a positive odd sample count")
        self.metric = metric
        self.samples = samples

    @property
    def prompt(self) -> Any:
        return self.metric.prompt

    async def ascore(self, *, user_input: str, response: str) -> MedianMetricResult:
        values = []
        for _ in range(self.samples):
            result = await self.metric.ascore(user_input=user_input, response=response)
            values.append(float(result.value))
        return MedianMetricResult(value=median(values))


def judge_model() -> str:
    return os.getenv("EVAL_JUDGE_MODEL", DEFAULT_JUDGE_MODEL)


def assert_independent_judge() -> None:
    judge = judge_model().casefold()
    generation_models = {
        os.getenv("OPENAI_MODEL", "gpt-4.1-mini").casefold(),
        os.getenv("OPENAI_CHAT_MODEL", "").casefold(),
        os.getenv("OPENAI_INSIGHT_MODEL", "").casefold(),
    }
    generation_models.discard("")
    if judge in generation_models:
        raise RuntimeError("EVAL_JUDGE_MODEL must differ from all response-generation models")


def configure_judge_parameters(llm: Any, model: str) -> None:
    if not model.casefold().startswith("gpt-5."):
        return
    llm.model_args.pop("max_tokens", None)
    llm.model_args.pop("top_p", None)
    llm.model_args["max_completion_tokens"] = 4096
    llm.model_args["temperature"] = 1.0


@lru_cache(maxsize=1)
def _components() -> dict[str, Any]:
    from openai import AsyncOpenAI
    from ragas.embeddings.base import embedding_factory
    from ragas.llms import llm_factory
    from ragas.metrics.collections import (
        AnswerRelevancy,
        ContextPrecision,
        ContextRecall,
        DomainSpecificRubrics,
        Faithfulness,
    )

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for RAGAS evaluation")
    async_client = AsyncOpenAI(api_key=api_key)
    model = judge_model()
    llm = llm_factory(model, provider="openai", client=async_client)
    configure_judge_parameters(llm, model)
    embeddings = embedding_factory(
        "openai",
        model="text-embedding-3-small",
        client=async_client,
        interface="modern",
    )
    answer_relevancy = MedianAnswerRelevancy(
        AnswerRelevancy(llm=llm, embeddings=embeddings, strictness=1),
        samples=3,
    )
    answer_relevancy.prompt.instruction = ANSWER_RELEVANCY_INSTRUCTION
    faithfulness = Faithfulness(llm=llm)
    faithfulness.statement_generator_prompt.instruction = FAITHFULNESS_STATEMENT_INSTRUCTION
    faithfulness.nli_statement_prompt.instruction = FAITHFULNESS_NLI_INSTRUCTION
    return {
        "faithfulness": faithfulness,
        "answer_relevancy": answer_relevancy,
        "context_precision": ContextPrecision(llm=llm),
        "context_recall": ContextRecall(llm=llm),
        "insight_rubric": DomainSpecificRubrics(llm=llm, rubrics=INSIGHT_RUBRICS, with_reference=True),
    }


async def _score_rag_async(
    *,
    user_input: str,
    response: str,
    contexts: list[str],
    reference: str,
    faithfulness_contexts: list[str] | None = None,
) -> dict[str, float]:
    metrics = _components()
    calls = {
        "ragas_faithfulness": metrics["faithfulness"].ascore(
            user_input=user_input,
            response=response,
            retrieved_contexts=faithfulness_contexts or contexts,
        ),
        "ragas_answer_relevancy": metrics["answer_relevancy"].ascore(
            user_input=user_input, response=response
        ),
        "ragas_context_precision": metrics["context_precision"].ascore(
            user_input=user_input, reference=reference, retrieved_contexts=contexts
        ),
        "ragas_context_recall": metrics["context_recall"].ascore(
            user_input=user_input, reference=reference, retrieved_contexts=contexts
        ),
    }
    results = await asyncio.gather(*calls.values())
    return {name: round(float(result.value), 4) for name, result in zip(calls, results, strict=True)}


def score_rag(
    *,
    user_input: str,
    response: str,
    contexts: list[str],
    reference: str,
    faithfulness_contexts: list[str] | None = None,
) -> dict[str, float]:
    return asyncio.run(
        _score_rag_async(
            user_input=user_input,
            response=response,
            contexts=contexts,
            reference=reference,
            faithfulness_contexts=faithfulness_contexts,
        )
    )


async def _score_insight_async(*, response: str, reference: str, contexts: list[str]) -> tuple[float, str | None]:
    result = await _components()["insight_rubric"].ascore(
        user_input="Create a parent-friendly English learning insight from this graded assessment.",
        response=response,
        reference=reference,
        retrieved_contexts=contexts,
    )
    return float(result.value), result.reason


def score_insight(*, response: str, reference: str, contexts: list[str]) -> tuple[float, str | None]:
    score, reason = asyncio.run(_score_insight_async(response=response, reference=reference, contexts=contexts))
    return round(score, 2), reason
