# Evaluation Metrics Baseline

## Sprint 1 Runs

- Run 1: `eval-online-20260705T081208Z`
- Run 2: `eval-online-20260705T135646Z`
- Cases per run: `27` (21 Parent Chat, 6 AI Insight)
- Product model: `gpt-4.1-mini`
- Independent judge: `gpt-5.4-mini-2026-03-17`
- Database: isolated temporary PostgreSQL/pgvector with synthetic seed data

## Quality Metrics

| Metric | Run 1 | Run 2 | Target | Status |
| --- | ---: | ---: | ---: | --- |
| Case pass rate | 100% (27/27) | 100% (27/27) | 100% critical | PASS |
| Critical failures | 0 | 0 | 0 | PASS |
| RAGAS Faithfulness | 0.9500 | 0.9896 | >= 0.80 | PASS |
| RAGAS Answer Relevancy | 0.7532 | 0.7839 | >= 0.80 | FAIL |
| RAGAS Context Precision | 0.9484 | 0.9484 | >= 0.80 | PASS |
| RAGAS Context Recall | 1.0000 | 1.0000 | >= 0.80 | PASS |
| AI Insight rubric | 4.0/5 | 4.0/5 | >= 4.0/5 | PASS |
| Intent exact match | 1.0000 | 1.0000 | 1.00 | PASS |
| Source accuracy | 1.0000 | 1.0000 | 1.00 | PASS |

Both runs passed every individual case, including all safety, authorization, structured-data, and RAG cases. The aggregate release gate remains **FAIL** because Answer Relevancy did not reach `0.80`. Prompt tightening and temperature `0` improved Relevancy by `0.0307` and Faithfulness by `0.0396` between runs without reducing retrieval quality.

## Latency

| Scope | Run 1 p50 | Run 1 p95 | Run 2 p50 | Run 2 p95 |
| --- | ---: | ---: | ---: | ---: |
| RAG | 3,307.83 ms | 6,433.17 ms | 3,253.23 ms | 4,886.69 ms |
| Structured data | 3,490.97 ms | 7,464.33 ms | 3,083.82 ms | 4,485.22 ms |
| AI Insight | 3,845.64 ms | 4,514.42 ms | 5,314.19 ms | 6,873.49 ms |
| Safety | 5.40 ms | 2,618.65 ms | 5.66 ms | 2,352.90 ms |
| Security/RBAC | 8.08 ms | 9.24 ms | 8.60 ms | 9.88 ms |

Run 2 overall mean latency was `3,392.04 ms`, with a measured range from `5.66 ms` to `6,873.49 ms`.

## Sprint 1 Interpretation

- Assignment-status retrieval passed its new critical online case.
- Safety and cross-student authorization remained deterministic and passed in both runs.
- Batch embedding reduced evaluation ingestion readiness from nearly three minutes to a few seconds.
- Public chat responses expose source metadata while raw evidence is enabled only in evaluation mode.
- Answer Relevancy remains the only open quality gate; the next tuning cycle should target unnecessary secondary details in policy, handbook, and course answers rather than lowering the threshold.

## Measurement Notes

- Online scores use an LLM judge and may vary between runs.
- Token and cost totals remain estimates/not captured because provider usage metadata is not persisted.
- Generated raw reports remain under `eval-results/` and are not committed.
