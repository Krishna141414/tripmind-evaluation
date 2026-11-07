"""REST API v1: JSON in/out, API-key auth, consistent {"error": {code, message}} errors."""
from flask import Blueprint, current_app, g, jsonify, request
from pydantic import ValidationError

from ..errors import ApiError
from ..extensions import csrf, db, limiter
from ..models import Conversation
from ..schemas import HistoryQuery, field_errors
from ..security import api_key_required
from ..services.ask_flow import handle_ask
from ..services.rag_service import rag_service

bp = Blueprint("api", __name__, url_prefix="/api/v1")
csrf.exempt(bp)                          # token-authenticated, no cookies -> CSRF does not apply


@bp.get("/health")
def health():
    db.session.execute(db.text("SELECT 1"))
    return jsonify({"status": "ok", "database": "ok", "ai": rag_service.health()})


@bp.post("/ask")
@limiter.limit(lambda: current_app.config["RATE_LIMIT"])
@api_key_required
def ask():
    if not request.is_json:
        raise ApiError(400, "invalid_body", "Send a JSON body like {\"question\": \"...\"}.")
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError(400, "invalid_body", "Body must be a JSON object like {\"question\": \"...\"}.")
    payload.pop("simulate_llm_failure", None)          # demo switch is UI-only
    convo, timings = handle_ask(g.api_user, payload, channel="api")
    return jsonify({"data": convo, "timings": timings}), 201


@bp.get("/history")
@api_key_required
def history():
    try:
        q = HistoryQuery.model_validate(request.args.to_dict())
    except ValidationError as e:
        d = field_errors(e)
        raise ApiError(422, "validation_error", d[0]["message"], d)
    rows = (Conversation.query.filter_by(user_id=g.api_user.id).order_by(Conversation.created_at.desc())
            .offset(q.offset).limit(q.limit).all())
    total = Conversation.query.filter_by(user_id=g.api_user.id).count()
    return jsonify({"data": [r.to_dict() for r in rows], "total": total, "limit": q.limit, "offset": q.offset})
