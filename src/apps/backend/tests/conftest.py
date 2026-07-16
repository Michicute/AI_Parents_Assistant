import os
import sys
from pathlib import Path

import pytest
from sqlalchemy import text

os.environ.setdefault("APP_SECRET_KEY", "test-app-secret")
os.environ.setdefault("AI_PROVIDER", "mock")
os.environ.setdefault("EMBEDDING_PROVIDER", "mock")
os.environ.setdefault("EXPOSE_AI_EVIDENCE", "true")

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture(autouse=True)
def reset_postgres_database(monkeypatch, request):
    if any(name in str(request.node.nodeid) for name in ("test_zalo_format.py", "test_guardrails.py", "test_evals.py")):
        yield
        return

    from app.db.base import Base
    from app.db.seed import seed
    from app.db.session import engine
    from app.services.chat_sessions import clear_sessions
    from app.services.intent_router import (
        IntentRoutingResult,
        OpenAIIntentClassifier,
        OpenAIStudentNameExtractor,
        StudentNameExtractionResult,
        route_intent,
    )

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    clear_sessions()
    seed()

    def classify_without_network(self, message: str, locale: str | None = None) -> IntentRoutingResult:
        intent = route_intent(message)
        return IntentRoutingResult(primary_intent=intent, intents=[intent], confidence=0.95)

    def extract_names_without_network(
        self,
        message: str,
        *,
        authorized_student_names: list[str],
        locale: str | None = None,
    ) -> StudentNameExtractionResult:
        return StudentNameExtractionResult(mentioned_student_names=[], confidence=0.95)

    monkeypatch.setattr(OpenAIIntentClassifier, "classify", classify_without_network)
    monkeypatch.setattr(OpenAIStudentNameExtractor, "extract", extract_names_without_network)
    yield
