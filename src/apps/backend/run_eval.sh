#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUITE="${1:-deterministic}"

case "$SUITE" in
  deterministic|online|rag|all) ;;
  *)
    echo "Usage: ./run_eval.sh [deterministic|online|rag|all]" >&2
    exit 2
    ;;
esac

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RESULT_DIR="$SCRIPT_DIR/eval-results"
RESULT_FILE="$RESULT_DIR/eval-${SUITE}-${TIMESTAMP}.json"

mkdir -p "$RESULT_DIR"
cd "$SCRIPT_DIR"

if [[ "$SUITE" == "online" || "$SUITE" == "rag" || "$SUITE" == "all" ]]; then
  if [[ "$SUITE" == "all" ]]; then
    "$0" deterministic
  fi
  ENV_FILE="$SCRIPT_DIR/../../.env"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing $ENV_FILE. Add OPENAI_API_KEY before running online evaluation." >&2
    exit 1
  fi
  if ! grep -Eq '^OPENAI_API_KEY=.+$' "$ENV_FILE"; then
    echo "OPENAI_API_KEY is missing from $ENV_FILE" >&2
    exit 1
  fi
  if [[ "$SUITE" == "rag" ]]; then
    export EVAL_CASE_SUITE="rag"
    export EVAL_RUN_ID="eval-rag-${TIMESTAMP}"
  else
    unset EVAL_CASE_SUITE || true
    export EVAL_RUN_ID="eval-online-${TIMESTAMP}"
  fi
  COMPOSE=(docker compose -p c2-app-eval --env-file "$ENV_FILE" -f docker-compose.eval.yml)
  cleanup() {
    "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  }
  trap cleanup EXIT INT TERM
  cleanup
  echo "Running isolated online evaluation with temporary PostgreSQL/pgvector..."
  "${COMPOSE[@]}" build eval-seed eval-backend eval-runner
  "${COMPOSE[@]}" up -d eval-backend
  "${COMPOSE[@]}" run --rm --no-deps eval-runner
  exit $?
fi

echo "Running evaluation suite: $SUITE"
PYTHONPATH=. python -m evals.run --suite "$SUITE" --output "$RESULT_FILE"
PYTHONPATH=. python -m evals.report --input "$RESULT_FILE"

echo
echo "Evaluation complete."
echo "JSON: $RESULT_FILE"
echo "Markdown: ${RESULT_FILE%.json}.md"
echo "Metrics: ${RESULT_FILE%.json}-metrics.md"
echo "Teacher review: ${RESULT_FILE%.json}-teacher-review.csv"
