# Parent AI Evaluation

The evaluation package separates free deterministic checks from OpenAI-backed online checks.

Every run writes a general report (`*.md`), a metric table (`*-metrics.md`), raw results (`*.json`), and a teacher-review CSV when applicable.

Version-controlled mentor evidence is available in:

- [`evidence/manual-eval-evidence.md`](evidence/manual-eval-evidence.md): five representative cases with actual outputs and manual verdicts.
- [`evidence/evaluation-metrics-baseline.md`](evidence/evaluation-metrics-baseline.md): quality, latency, token, and cost baseline from a recorded online run.

## One-command run

From `src/apps/backend`, run the free deterministic evaluation and generate all reports with:

```bash
./run_eval.sh
```

To run the OpenAI-backed suite after configuring the isolated eval environment:

```bash
./run_eval.sh online
```

Run only the eight RAGAS cases while tuning retrieval or evaluator configuration:

```bash
./run_eval.sh rag
```

## Deterministic suite

Run from `src/apps/backend`:

```bash
python -m evals.run --suite deterministic
python -m evals.report --input eval-results/<generated-file>.json
```

This suite covers rule-first intent routing and input, retrieval, and output guardrails. It does not call OpenAI or require PostgreSQL.

## Isolated online suite

The online command creates a temporary PostgreSQL/pgvector database, seeds curated data, ingests RAG documents, runs the suite, and removes the containers and volume afterward. It reads `OPENAI_API_KEY` from `src/.env`.

```bash
./run_eval.sh online
```

The suite contains 20 Parent Chat cases and 6 database-backed AI Insight cases. Eight chat cases use RAGAS Faithfulness, Answer Relevancy, Context Precision, and Context Recall. AI Insight uses a domain rubric scored from 1 to 5. The response model is `gpt-4.1-mini`; the independent judge defaults to `gpt-5.4-mini-2026-03-17` and the runner rejects identical generation/judge models.

Token counts are estimates because the public product API does not expose provider usage. Set current model prices explicitly in `src/.env` if cost estimates are required:

```bash
export EVAL_INPUT_PRICE_PER_1M='...'
export EVAL_OUTPUT_PRICE_PER_1M='...'
```

The Compose configuration has no host database port and uses the project name `c2-app-eval`, so it cannot reuse the development Compose volume.

## Teacher review

`evals.report` creates a CSV with six `1-5` rubric columns and a major-edit flag. Two teachers should independently review critical samples. Resolve disagreements before updating the frozen expected dataset.

After completing the CSV, include its aggregate scores in the Markdown report:

```bash
python -m evals.report \
  --input eval-results/<generated-file>.json \
  --teacher-review eval-results/<generated-file>-teacher-review.csv
```

## Release rules

- Any failed critical case blocks release.
- Authorization leakage, secret leakage, submit-ready answers, and known critical prompt injection require 100% pass.
- Online results should be compared across at least two consecutive runs because model responses vary.
- Commit datasets and approved baseline summaries, but do not commit generated `eval-results/` or raw student data.
