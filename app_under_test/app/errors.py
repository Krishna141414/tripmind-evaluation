"""Global error handlers: friendly HTML pages for the UI, {"error": {code, message}} JSON for the API."""
from flask import jsonify, render_template, request
from flask_wtf.csrf import CSRFError
from werkzeug.exceptions import HTTPException

from .logging_setup import event, log

PAGES = {
    400: ("Bad request", "Something about that request wasn't right. Please go back and try again."),
    401: ("Please sign in", "You need to be signed in to see this page."),
    403: ("Access denied", "Your account doesn't have permission to open this page."),
    404: ("Page not found", "We couldn't find that page. It may have moved, or the link is wrong."),
    405: ("Method not allowed", "That action isn't supported here."),
    413: ("Request too large", "That request was bigger than we accept."),
    429: ("Slow down", "Too many requests in a short time. Please wait a minute and try again."),
    500: ("Something went wrong", "An unexpected error happened on our side. It has been logged."),
    503: ("AI service unavailable", "The AI service is unavailable right now. Please try again."),
}
CODES = {400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed",
         413: "payload_too_large", 422: "validation_error", 429: "rate_limited", 500: "internal_error",
         503: "ai_service_unavailable"}


class ApiError(Exception):
    """Raise anywhere to return a consistent JSON (or HTML) error."""
    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details


class AIServiceError(ApiError):
    def __init__(self, message="AI service unavailable, try again."):
        super().__init__(503, "ai_service_unavailable", message)


def wants_json():
    return (request.path.startswith("/api/") or request.is_json
            or request.accept_mimetypes.best == "application/json"
            or request.headers.get("X-Requested-With") == "fetch")


def error_response(status, code, message, details=None):
    if wants_json():
        body = {"error": {"code": code, "message": message}}
        if details:
            body["error"]["details"] = details
        return jsonify(body), status
    title, text = PAGES.get(status, PAGES[500])
    return render_template("error.html", status=status, title=title, text=message if status in (503,) else text), status


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def api_error(e):
        return error_response(e.status, e.code, e.message, e.details)

    @app.errorhandler(CSRFError)
    def csrf_error(e):
        event("warning", "CSRF token missing or invalid", event="csrf_blocked")
        return error_response(400, "csrf_failed", "Security token missing or invalid. Refresh the page and retry.")

    @app.errorhandler(HTTPException)
    def http_error(e):
        msg = {429: "Too many requests. Limit: " + str(e.description) + ". Please wait and retry.",
               404: "Resource not found.", 401: "Authentication required.", 403: "You don't have access.",
               413: "Request body too large."}.get(e.code, e.description)
        if e.code == 429:
            event("warning", "rate limit hit", event="rate_limited", limit=str(e.description))
        return error_response(e.code, CODES.get(e.code, "http_error"), msg)

    @app.errorhandler(Exception)
    def unhandled(e):
        # full stack trace goes to the log only; the user gets a friendly page / JSON
        log.error("unhandled exception: %r", e, exc_info=True,
                  extra={"extra_fields": {"event": "exception", "status": 500}})
        return error_response(500, "internal_error", "Something went wrong on our side. It has been logged.")
