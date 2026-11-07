"""Admin-only pages: structured log viewer + a forced-error demo."""
from flask import Blueprint, current_app, jsonify, render_template, request

from ..logging_setup import tail
from ..security import admin_required

bp = Blueprint("admin", __name__, url_prefix="/admin")
LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR"}


@bp.get("/logs")
@admin_required
def logs():
    return render_template("admin_logs.html")


@bp.get("/logs/data")
@admin_required
def logs_data():
    level = request.args.get("level", "").upper()
    limit = min(max(request.args.get("limit", 150, type=int) or 150, 1), 500)
    rows = tail(current_app.config["LOG_FILE"], limit=limit, level=level if level in LEVELS else None)
    for r in rows:                                   # keep only the end of long stack traces
        if "stack" in r:
            r["stack"] = r["stack"][-1500:]
    return jsonify({"data": rows})


@bp.get("/demo/500")
@admin_required
def demo_500():
    """Raises on purpose: shows the friendly 500 page while the stack trace goes to the log."""
    raise RuntimeError("Demo: forced service error from /admin/demo/500")
