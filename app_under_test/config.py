"""Configuration classes. Every value comes from the environment (.env via python-dotenv)."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

DEV_SECRET = "dev-insecure-secret-change-me"


def env_bool(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


class BaseConfig:
    SECRET_KEY = os.getenv("SECRET_KEY", DEV_SECRET)
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///tripmind.db")   # relative -> instance/
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # AI service
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "local").lower()          # local | extractive
    LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "60"))                  # seconds before falling back
    WARMUP_MODELS = env_bool("WARMUP_MODELS", True)                      # load models in background at start

    # Security
    RATE_LIMIT = os.getenv("RATE_LIMIT", "10 per minute")                # asks per user / API key
    LOGIN_RATE_LIMIT = os.getenv("LOGIN_RATE_LIMIT", "5 per minute")     # stricter, per IP
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_HEADERS_ENABLED = True
    MAX_CONTENT_LENGTH = 16 * 1024                                       # 16 KB request body limit
    MAX_QUESTION_CHARS = 500
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = False
    REMEMBER_COOKIE_HTTPONLY = True
    PERMANENT_SESSION_LIFETIME = 8 * 3600
    WTF_CSRF_TIME_LIMIT = None                                           # token valid for the session

    # Logging
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
    LOG_FILE = os.getenv("LOG_FILE", str(ROOT / "logs" / "app.log"))

    DEBUG = False
    TESTING = False

    @classmethod
    def validate(cls):
        """Hook for config-specific startup checks."""


class DevConfig(BaseConfig):
    DEBUG = False          # keep the debugger off: errors go through our handlers, even in dev


class ProdConfig(BaseConfig):
    SESSION_COOKIE_SECURE = True    # cookies only over HTTPS
    REMEMBER_COOKIE_SECURE = True

    @staticmethod
    def check_secret(key):
        if not key or key == DEV_SECRET or "change" in key.lower() or len(key) < 32:
            raise RuntimeError("ProdConfig: set a real SECRET_KEY (32+ random chars) in the environment/.env")

    @classmethod
    def validate(cls):
        """Refuse to start in production without a real secret key."""
        cls.check_secret(os.getenv("SECRET_KEY", ""))


class TestConfig(BaseConfig):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"     # in-memory
    WARMUP_MODELS = False


CONFIGS = {"development": DevConfig, "production": ProdConfig, "testing": TestConfig}
