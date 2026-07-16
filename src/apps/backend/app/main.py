import logging
from threading import Thread

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router
from app.core.config import get_settings
from app.db.seed import ensure_schema, seed
from app.services.rag import ingest_documents_from_folder
from app.services.scheduled_zalo import run_scheduled_zalo_worker

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()
    allowed_origins = {settings.frontend_url.rstrip("/")}
    allow_origin_regex = None
    if settings.app_env == "development":
        allowed_origins.update(
            {
                "http://localhost:3000",
                "http://localhost:3001",
                "http://localhost:3002",
                "http://localhost:3003",
            }
        )
        allow_origin_regex = r"^http://(localhost|127\.0\.0\.1):\d+$"
    app = FastAPI(
        title="AI Parent Assistant API",
        version="0.1.0",
        description="FastAPI backend for English learning center parent support.",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=sorted(allowed_origins),
        allow_origin_regex=allow_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router, prefix="/api")

    @app.on_event("startup")
    def seed_development_database() -> None:
        ensure_schema()
        if settings.app_env == "development":
            seed()
        if settings.rag_auto_ingest_on_startup:
            Thread(target=_ingest_documents_on_startup, daemon=True).start()
        if settings.scheduled_zalo_worker_enabled:
            Thread(target=run_scheduled_zalo_worker, daemon=True).start()
        else:
            logger.info("Scheduled Zalo notification worker is disabled")

    return app


def _ingest_documents_on_startup() -> None:
    try:
        summary = ingest_documents_from_folder()
        logger.info("RAG auto-ingest completed: %s", summary)
    except Exception:
        logger.exception("RAG auto-ingest failed")


app = create_app()
