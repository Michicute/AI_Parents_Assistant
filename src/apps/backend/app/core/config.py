from functools import lru_cache
from uuid import uuid4
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"
    openai_chat_model: str | None = None
    openai_insight_model: str | None = None
    openai_draft_model: str | None = None
    openai_vision_model: str | None = None
    openai_timeout_seconds: float = 45.0
    openai_max_retries: int = 1
    local_llm_base_url: str = "http://localhost:8080/v1"
    local_llm_api_key: str = "local"
    local_llm_model: str = "Qwen3-4B-Q4_K_M.gguf"
    local_llm_chat_model: str | None = None
    local_llm_insight_model: str | None = None
    local_llm_draft_model: str | None = None
    local_llm_router_model: str | None = None
    anthropic_api_key: str | None = None
    ai_provider: str = "openai"
    embedding_provider: str = "openai"
    rag_documents_dir: str | None = None
    rag_auto_ingest_on_startup: bool = True
    expose_ai_evidence: bool = False
    app_secret_key: str | None = None
    database_url: str | None = None
    frontend_url: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"

    app_session_epoch: str = Field(default_factory=lambda: uuid4().hex)
    zalo_service_url: str = "http://localhost:4001"
    integration_shared_secret: str | None = "change-me"
    zalo_link_session_ttl_minutes: int = 30
    zalo_session_encryption_key: str | None = None
    scheduled_zalo_worker_enabled: bool = False


    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("app_session_epoch", mode="before")
    @classmethod
    def default_blank_session_epoch(cls, value: str | None) -> str:
        if value is None or value == "":
            return uuid4().hex
        return value

    @property
    def resolved_openai_chat_model(self) -> str:
        return self.openai_chat_model or self.openai_model

    @property
    def resolved_openai_insight_model(self) -> str:
        return self.openai_insight_model or self.openai_model

    @property
    def resolved_openai_draft_model(self) -> str:
        return self.openai_draft_model or self.openai_model

    @property
    def resolved_openai_vision_model(self) -> str:
        return self.openai_vision_model or self.resolved_openai_draft_model

    @property
    def resolved_local_llm_chat_model(self) -> str:
        return self.local_llm_chat_model or self.local_llm_model

    @property
    def resolved_local_llm_insight_model(self) -> str:
        return self.local_llm_insight_model or self.local_llm_model

    @property
    def resolved_local_llm_draft_model(self) -> str:
        return self.local_llm_draft_model or self.local_llm_model

    @property
    def resolved_local_llm_router_model(self) -> str:
        return self.local_llm_router_model or self.local_llm_model


@lru_cache
def get_settings() -> Settings:
    return Settings()
