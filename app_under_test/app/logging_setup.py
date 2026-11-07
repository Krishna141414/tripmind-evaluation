"""Structured JSON-lines logging (file + console) with request id, user, route, status and latency."""
import json
import logging
import time
import traceback
import uuid
from collections import deque
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path

from flask import g, has_request_context, request

log = logging.getLogger("tripmind")
QUIET_ROUTES = {"/admin/logs/data", "/api/v1/health"}      # polled often -> logged at DEBUG


class JsonFormatter(logging.Formatter):
    def format(self, record):
        entry = {"ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                 "level": record.levelname, "logger": record.name, "msg": record.getMessage()}
        if has_request_context():
            entry.update(request_id=getattr(g, "request_id", None), user=_user(),
                         method=request.method, route=request.path, ip=request.remote_addr)
        entry.update(getattr(record, "extra_fields", {}))          # status, latency_ms, event, ...
        if record.exc_info:
            entry["stack"] = "".join(traceback.format_exception(*record.exc_info))
        return json.dumps(entry, ensure_ascii=False, default=str)


def _user():
    from flask_login import current_user
    api_user = getattr(g, "api_user", None)
    if api_user is not None:
        return api_user.username
    try:
        return current_user.username if current_user.is_authenticated else "anonymous"
    except Exception:
        return "anonymous"


def event(level, msg, exc_info=False, **fields):
    """Log with structured extra fields, e.g. event('warning', 'blocked', event='prompt_injection')."""
    log.log(getattr(logging, level.upper()), msg, exc_info=exc_info, extra={"extra_fields": fields})


def setup_logging(app):
    log.setLevel(app.config["LOG_LEVEL"])
    log.handlers.clear()
    log.propagate = False
    fmt = JsonFormatter()
    console = logging.StreamHandler()
    console.setFormatter(fmt)
    log.addHandler(console)
    if not app.testing:
        path = Path(app.config["LOG_FILE"])
        path.parent.mkdir(parents=True, exist_ok=True)
        fh = RotatingFileHandler(path, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
        fh.setFormatter(fmt)
        log.addHandler(fh)
    logging.getLogger("werkzeug").setLevel(logging.WARNING)       # our access log replaces werkzeug's

    @app.before_request
    def start_request():
        rid = request.headers.get("X-Request-ID", "")
        g.request_id = rid if rid.isalnum() and len(rid) <= 32 else uuid.uuid4().hex[:12]
        g.t0 = time.perf_counter()

    @app.after_request
    def access_log(resp):
        resp.headers["X-Request-ID"] = g.get("request_id", "")
        if request.path.startswith("/static/"):
            return resp
        ms = round((time.perf_counter() - g.get("t0", time.perf_counter())) * 1000, 1)
        level = "error" if resp.status_code >= 500 else "warning" if resp.status_code >= 400 else "info"
        if request.path in QUIET_ROUTES and resp.status_code < 400:
            level = "debug"
        event(level, f"{request.method} {request.path} -> {resp.status_code}",
              event="request", status=resp.status_code, latency_ms=ms)
        return resp


def tail(path, limit=200, level=None):
    """Return the newest `limit` log entries (newest first), optionally filtered by level."""
    p = Path(path)
    if not p.exists():
        return []
    with p.open("r", encoding="utf-8", errors="replace") as f:
        lines = deque(f, maxlen=4000)
    out = []
    for line in reversed(lines):
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if level and row.get("level") != level:
            continue
        out.append(row)
        if len(out) >= limit:
            break
    return out
