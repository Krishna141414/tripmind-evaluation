"""Safety Lab page for the TripMind evaluation (Task 13).

    python app.py            -> http://127.0.0.1:5000

Serves the single-page showcase (web/), the saved results (results/*.json), the eval set and the report.
"Run live" and the Attack Lab text box call the real app_under_test pipeline when the models can load;
otherwise the page simply uses the saved results.
"""
import json
import threading
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=None)
_live = {"ready": False, "error": None, "mod": None}
_lock = threading.Lock()                       # one live pipeline call at a time (CPU model)


def _read(path, default=None):
    p = ROOT / path
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def _warmup():
    """Load the eval runner (and through it the app's models) in the background."""
    try:
        import sys
        sys.path.insert(0, str(ROOT / "eval"))
        import run_eval
        run_eval.rp.load_index(), run_eval.rp.embedder(), run_eval.rp.llm()
        _live.update(mod=run_eval, ready=True)
    except Exception as e:                     # noqa: BLE001 - page still works with saved results
        _live["error"] = type(e).__name__
        app.logger.warning("live mode unavailable: %s", e)


# ---------- page + data ----------
@app.get("/")
def index():
    return send_from_directory(ROOT / "web", "index.html")


@app.get("/web/<path:name>")
def web(name):
    return send_from_directory(ROOT / "web", name)


@app.get("/charts/<path:name>")
def charts(name):
    return send_from_directory(ROOT / "results" / "charts", name)


@app.get("/api/data")
def data():
    report = ROOT / "EVALUATION_REPORT.md"
    return jsonify(eval_set=_read("eval/eval_set.json", []), baseline=_read("results/baseline.json"),
                   safeguarded=_read("results/safeguarded.json"),
                   report=report.read_text(encoding="utf-8") if report.exists() else "")


@app.get("/api/health")
def health():
    return jsonify(live=_live["ready"], error=_live["error"])


# ---------- live calls (optional) ----------
def _need_live():
    if not _live["ready"]:
        abort(503, "live mode not ready - using saved results")
    return _live["mod"]


@app.post("/api/run-case")
def run_case():
    """Run one eval case live: {"id": "PI05", "version": "baseline"|"safeguarded"}."""
    mod, body = _need_live(), request.get_json(silent=True) or {}
    case = next((c for c in _read("eval/eval_set.json", []) if c["id"] == body.get("id")), None)
    if case is None:
        abort(404, "unknown case id")
    with _lock:
        return jsonify(mod.run_case(case, body.get("version") == "safeguarded"))


@app.post("/api/ask")
def ask():
    """Attack Lab text box: run free text through the safeguarded pipeline (+ the baseline regex check)."""
    mod, body = _need_live(), request.get_json(silent=True) or {}
    text = str(body.get("question", ""))[:600]
    case = {"id": "LIVE", "category": "prompt_injection", "input": text, "expected_behavior": "block",
            "expected_keywords": [], "expected_source": "", "notes": "live input"}
    from app.security import detect_prompt_injection
    with _lock:
        r = mod.run_case(case, True)
    r["baseline_filter"] = detect_prompt_injection(text)
    return jsonify(r)


@app.errorhandler(Exception)
def on_error(e):
    """Friendly JSON errors, never a stack trace."""
    code = getattr(e, "code", 500) or 500
    msg = getattr(e, "description", "internal error") if code != 500 else "internal error"
    if code == 500:
        app.logger.exception("request failed")
    return jsonify(error=msg), code


if __name__ == "__main__":
    threading.Thread(target=_warmup, daemon=True).start()
    app.run(host="127.0.0.1", port=5000, debug=False)
