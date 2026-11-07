"""Flask extensions, created once and bound to the app in create_app()."""
import hashlib

from flask import request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_login import LoginManager, current_user
from flask_sqlalchemy import SQLAlchemy
from flask_wtf.csrf import CSRFProtect


def rate_limit_key():
    """Limit per API key, else per logged-in user, else per IP."""
    api_key = request.headers.get("X-API-Key", "") or request.headers.get("Authorization", "")[7:]
    if api_key:
        return "key:" + hashlib.sha256(api_key.encode()).hexdigest()[:16]
    if current_user and current_user.is_authenticated:
        return f"user:{current_user.id}"
    return "ip:" + get_remote_address()


db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect()
limiter = Limiter(key_func=rate_limit_key, default_limits=["300 per minute"])
