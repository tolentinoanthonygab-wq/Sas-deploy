import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional in runtime envs
    load_dotenv = None

if load_dotenv is not None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(env_path, override=True)
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_csv_list(value: str | None, default: list[str]) -> list[str]:
    if value is None:
        return default
    parsed = [item.strip() for item in value.split(",") if item.strip()]
    return parsed or default


@dataclass(frozen=True)
class Settings:
    database_url: str
    db_pool_size: int
    db_max_overflow: int
    db_pool_timeout_seconds: int
    db_pool_recycle_seconds: int
    secret_key: str
    jwt_algorithm: str
    access_token_expire_minutes: int
    auth_enable_mfa: bool
    face_match_threshold: float
    liveness_min_score: float
    allow_liveness_bypass_when_model_missing: bool
    anti_spoof_scale: float
    anti_spoof_model_path: str
    geo_max_allowed_accuracy_m: float
    geo_max_travel_speed_mps: float
    event_status_sync_enabled: bool
    event_status_sync_interval_seconds: int

    import_max_file_size_mb: int
    import_chunk_size: int
    import_storage_dir: str
    import_rate_limit_count: int
    import_rate_limit_window_seconds: int

    celery_broker_url: str
    celery_result_backend: str
    celery_task_time_limit_seconds: int

    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: str
    smtp_from_email: str
    smtp_use_tls: bool
    login_url: str

    school_logo_storage_dir: str
    school_logo_max_file_size_mb: int
    school_logo_public_prefix: str
    cors_allowed_origins: list[str]


def get_settings() -> Settings:
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")

    return Settings(
        database_url=os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/fastapi_db"),
        db_pool_size=max(1, int(os.getenv("DB_POOL_SIZE", "10"))),
        db_max_overflow=max(0, int(os.getenv("DB_MAX_OVERFLOW", "10"))),
        db_pool_timeout_seconds=max(1, int(os.getenv("DB_POOL_TIMEOUT_SECONDS", "15"))),
        db_pool_recycle_seconds=max(30, int(os.getenv("DB_POOL_RECYCLE_SECONDS", "1800"))),
        secret_key=os.getenv("SECRET_KEY", "change-this-secret-in-production"),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        access_token_expire_minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")),
        auth_enable_mfa=_as_bool(os.getenv("AUTH_ENABLE_MFA"), True),
        face_match_threshold=float(os.getenv("FACE_MATCH_THRESHOLD", "0.5")),
        liveness_min_score=float(os.getenv("LIVENESS_MIN_SCORE", "0.85")),
        allow_liveness_bypass_when_model_missing=_as_bool(
            os.getenv("ALLOW_LIVENESS_BYPASS_WHEN_MODEL_MISSING"),
            False,
        ),
        anti_spoof_scale=float(os.getenv("ANTI_SPOOF_SCALE", "2.7")),
        anti_spoof_model_path=os.getenv("ANTI_SPOOF_MODEL_PATH", "").strip(),
        geo_max_allowed_accuracy_m=float(os.getenv("GEO_MAX_ALLOWED_ACCURACY_M", "30")),
        geo_max_travel_speed_mps=float(os.getenv("GEO_MAX_TRAVEL_SPEED_MPS", "60")),
        event_status_sync_enabled=_as_bool(os.getenv("EVENT_STATUS_SYNC_ENABLED"), True),
        event_status_sync_interval_seconds=max(
            30,
            int(os.getenv("EVENT_STATUS_SYNC_INTERVAL_SECONDS", "60")),
        ),
        import_max_file_size_mb=int(os.getenv("IMPORT_MAX_FILE_SIZE_MB", "50")),
        import_chunk_size=max(1, int(os.getenv("IMPORT_CHUNK_SIZE", "5000"))),
        import_storage_dir=os.getenv("IMPORT_STORAGE_DIR", "/tmp/valid8_imports"),
        import_rate_limit_count=max(1, int(os.getenv("IMPORT_RATE_LIMIT_COUNT", "3"))),
        import_rate_limit_window_seconds=max(1, int(os.getenv("IMPORT_RATE_LIMIT_WINDOW_SECONDS", "300"))),
        celery_broker_url=os.getenv("CELERY_BROKER_URL", redis_url),
        celery_result_backend=os.getenv("CELERY_RESULT_BACKEND", redis_url),
        celery_task_time_limit_seconds=max(60, int(os.getenv("CELERY_TASK_TIME_LIMIT_SECONDS", "10800"))),
        smtp_host=os.getenv("SMTP_HOST", ""),
        smtp_port=int(os.getenv("SMTP_PORT", "587")),
        smtp_username=os.getenv("SMTP_USERNAME", ""),
        smtp_password=os.getenv("SMTP_PASSWORD", ""),
        smtp_from_email=os.getenv("SMTP_FROM_EMAIL", "noreply@valid8.local"),
        smtp_use_tls=_as_bool(os.getenv("SMTP_USE_TLS"), True),
        login_url=os.getenv("LOGIN_URL", "http://localhost:5173"),
        school_logo_storage_dir=os.getenv("SCHOOL_LOGO_STORAGE_DIR", "/tmp/valid8_school_logos"),
        school_logo_max_file_size_mb=max(1, int(os.getenv("SCHOOL_LOGO_MAX_FILE_SIZE_MB", "2"))),
        school_logo_public_prefix=os.getenv("SCHOOL_LOGO_PUBLIC_PREFIX", "/media/school-logos"),
        cors_allowed_origins=_as_csv_list(
            os.getenv("CORS_ALLOWED_ORIGINS"),
            ["http://localhost:5173", "http://127.0.0.1:5173"],
        ),
    )
