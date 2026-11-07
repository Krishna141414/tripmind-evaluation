"""Validate -> injection guard -> RAG -> save. Shared by the web UI and the REST API."""
import json
import time

from pydantic import ValidationError

from ..errors import ApiError
from ..logging_setup import event
from ..models import Conversation, db
from ..schemas import AskRequest, field_errors
from ..security import detect_prompt_injection
from .rag_service import rag_service
from . import safeguards

BLOCKED_ANSWER = ("Request blocked: this looks like an attempt to override the assistant's instructions. "
                  "Please ask a travel question instead.")


def answer_question(question, simulate_llm_failure=False, use_safeguards=None):
    """Validate -> guard -> RAG, without saving (Task 13: the evaluation calls this directly).
    use_safeguards=None reads the SAFEGUARDS=on|off setting. Raises ApiError(422) for invalid input."""
    try:
        req = AskRequest.model_validate({"question": question, "simulate_llm_failure": simulate_llm_failure})
    except ValidationError as e:
        details = field_errors(e)
        event("info", "ask validation failed", event="validation_error", details=details)
        raise ApiError(422, "validation_error", details[0]["message"], details)
    if safeguards.enabled() if use_safeguards is None else use_safeguards:
        return safeguards.safe_ask(req.question, simulate_llm_failure=req.simulate_llm_failure)

    hit = detect_prompt_injection(req.question)
    if hit:
        event("warning", "prompt injection blocked", event="prompt_injection_blocked", match=hit)
        return {"answer": BLOCKED_ANSWER, "status": "blocked", "sources": [], "provider": "guard",
                "fallback": False, "fallback_reason": None, "timings": {"retrieve_ms": 0, "generate_ms": 0}}
    return rag_service.ask(req.question, simulate_llm_failure=req.simulate_llm_failure)


def handle_ask(user, payload, channel="web"):
    """Returns (conversation_dict, pipeline_timings). Raises ApiError(422) for invalid input."""
    t0 = time.perf_counter()
    payload = payload if isinstance(payload, dict) else {}
    question = payload.get("question", "")
    t_valid = time.perf_counter()
    result = answer_question(question if isinstance(question, str) else "",
                             simulate_llm_failure=bool(payload.get("simulate_llm_failure")) and user.is_admin)
    t_ai = time.perf_counter()

    convo = Conversation(user_id=user.id, question=question.strip(), answer=result["answer"],
                         sources_json=json.dumps(result["sources"], ensure_ascii=False), status=result["status"],
                         provider=result["provider"], fallback=result["fallback"], channel=channel,
                         latency_ms=round((t_ai - t0) * 1000))
    db.session.add(convo)
    db.session.commit()
    t_saved = time.perf_counter()
    event("info", f"ask {result['status']}", event="ask", status_ai=result["status"], provider=result["provider"],
          fallback=result["fallback"], latency_ms=convo.latency_ms, conversation_id=convo.id, channel=channel)

    data = convo.to_dict() | {"fallback_reason": result["fallback_reason"]}
    timings = {"validate_ms": round((t_valid - t0) * 1000, 1), **result["timings"],
               "save_ms": round((t_saved - t_ai) * 1000, 1)}
    return data, timings
