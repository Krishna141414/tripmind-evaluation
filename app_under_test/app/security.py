"""Security helpers: headers, prompt-injection guard, API-key auth and admin-only access."""
import re
from functools import wraps

from flask import abort, g, request
from flask_login import current_user, login_required

from .errors import ApiError
from .logging_setup import event
from .models import ApiKey, db, utcnow

CSP = ("default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; "
       "style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; "
       "img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; "
       "form-action 'self'; frame-ancestors 'none'")


def add_security_headers(resp):
    resp.headers["Content-Security-Policy"] = CSP
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.path.startswith("/api/") or request.endpoint in {"main.ask_submit"}:
        resp.headers["Cache-Control"] = "no-store"
    return resp


# ---------- Prompt-injection guard ----------
INJECTION_PATTERNS = [
    r"\b(ignore|disregard|forget|override|bypass)\b.{0,30}\b(previous|prior|above|earlier|all|your|the)\b.{0,20}"
    r"\b(instructions?|prompts?|rules|directions|context)\b",
    r"\b(reveal|show|print|repeat|leak)\b.{0,25}\b(system|hidden|original)\s+(prompt|instructions?|message)",
    r"\bsystem\s*prompt\b",
    r"\byou\s+are\s+now\b|\bact\s+as\s+(an?\s+)?(unfiltered|unrestricted|dan|evil)\b",
    r"\b(jailbreak|developer\s+mode|do\s+anything\s+now)\b",
    r"</?\s*(system|assistant|im_start|im_end)\s*>|<\|im_(start|end)\|>",
]
_INJECTION_RE = [re.compile(p, re.I | re.S) for p in INJECTION_PATTERNS]


def detect_prompt_injection(text):
    """Return the matched snippet if the text looks like a prompt-injection attempt, else None."""
    for rx in _INJECTION_RE:
        m = rx.search(text)
        if m:
            return m.group(0)[:80]
    return None


# ---------- Access control ----------
def admin_required(view):
    @wraps(view)
    @login_required
    def wrapper(*args, **kwargs):
        if not current_user.is_admin:
            event("warning", "admin page denied", event="forbidden")
            abort(403)
        return view(*args, **kwargs)
    return wrapper


def api_key_required(view):
    """API auth: `X-API-Key: tm_...` (or `Authorization: Bearer tm_...`). Sets g.api_user."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        raw = request.headers.get("X-API-Key", "")
        auth = request.headers.get("Authorization", "")
        if not raw and auth.lower().startswith("bearer "):
            raw = auth[7:].strip()
        if not raw:
            raise ApiError(401, "missing_api_key", "Send your API key in the X-API-Key header.")
        key = ApiKey.lookup(raw)
        if key is None:
            event("warning", "invalid API key", event="auth_failed")
            raise ApiError(401, "invalid_api_key", "The API key is invalid or has been regenerated.")
        key.last_used_at = utcnow()
        db.session.commit()
        g.api_user = key.user
        return view(*args, **kwargs)
    return wrapper
