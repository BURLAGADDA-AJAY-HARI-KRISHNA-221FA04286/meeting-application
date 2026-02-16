"""
Application configuration via environment variables.
Supports .env file auto-loading via pydantic-settings.
"""
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Application ────────────────────────────────────
    app_name: str = "AI Meeting Intelligence System"
    env: str = "dev"
    debug: bool = False

    # ── Security ───────────────────────────────────────
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 360
    refresh_token_expire_minutes: int = 10080  # 7 days
    algorithm: str = "HS256"

    # ── Database ───────────────────────────────────────
    database_url: str = "sqlite:///./meeting_intel.db"

    # ── AI / Gemini ────────────────────────────────────
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"
    gemini_temperature: float = 0.3
    gemini_max_retries: int = 2

    # ── CORS ───────────────────────────────────────────
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:5174"

    # ── Rate Limiting ──────────────────────────────────
    rate_limit_per_minute: int = 60

    # ── External Services ──────────────────────────────
    hf_api_key: str | None = None
    github_token: str | None = None

    # ── RAG Settings ───────────────────────────────────
    rag_chunk_size: int = 3        # Combine N subtitles into one chunk
    rag_top_k: int = 5             # Top-K retrieval
    rag_model_name: str = "all-MiniLM-L6-v2"

    # ── Redis / Celery ─────────────────────────────────
    redis_host: str = "localhost"
    redis_port: int = 6379
    celery_broker_url: str | None = None  # Auto-constructed if None
    celery_result_backend: str | None = None  # Auto-constructed if None

    @property
    def get_celery_broker_url(self) -> str:
        if self.celery_broker_url:
            return self.celery_broker_url
        return f"redis://{self.redis_host}:{self.redis_port}/0"

    @property
    def get_celery_result_backend(self) -> str:
        if self.celery_result_backend:
            return self.celery_result_backend
        return f"redis://{self.redis_host}:{self.redis_port}/1"

    @property
    def cors_origins_list(self) -> list[str]:
        return [v.strip() for v in self.cors_origins.split(",") if v.strip()]

    @property
    def is_production(self) -> bool:
        return self.env.lower() in ("prod", "production")

    @field_validator("secret_key")
    @classmethod
    def warn_default_secret(cls, v: str) -> str:
        if v == "change-me-in-production":
            import logging
            logging.getLogger("meetingai.config").warning(
                "⚠  Using default secret key. Set SECRET_KEY env var for production!"
            )
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8-sig",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
