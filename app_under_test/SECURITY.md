# Security measures

Every measure below is live in the app, and most can be tried from the **Security** page (`/security`).

| # | Measure | What it does | Where in the code |
|---|---|---|---|
| 1 | **Password hashing** | werkzeug `generate_password_hash` (scrypt + random salt). Plain passwords are never stored or logged. | `app/models.py` → `User.set_password / check_password` |
| 2 | **CSRF protection** | Flask-WTF `CSRFProtect` on every form (login, register, logout) and every session-based POST (`/ask`, key regeneration, demos). JS sends the token in `X-CSRFToken`. The token-authenticated REST API is exempt because it uses no cookies. | `app/extensions.py` (`csrf`), `app/__init__.py`, `templates/*` (`csrf_token()`), `static/js/app.js` (`TM.api`), `app/api/__init__.py` (`csrf.exempt`) |
| 3 | **Rate limiting** | Flask-Limiter: `RATE_LIMIT` (default 10/min) per user or API key on `/ask` and `/api/v1/ask`. Login is stricter: `LOGIN_RATE_LIMIT` (5/min) per IP. Registration: 10/hour per IP. 300/min default for everything else. Returns 429 + `Retry-After`. | `app/extensions.py` (`limiter`, `rate_limit_key`), decorators in `app/main/`, `app/api/`, `app/auth/` |
| 4 | **Secure session cookies** | `HttpOnly`, `SameSite=Lax`, `Secure` in `ProdConfig`; 8 h lifetime; Flask-Login `session_protection="strong"`. | `config.py`, `app/__init__.py` |
| 5 | **Security headers** | `Content-Security-Policy` (no inline scripts, no `eval`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store` on API responses. | `app/security.py` → `add_security_headers` |
| 6 | **Input validation + length limits** | Pydantic schemas for every input: question 3-500 chars and must contain letters or numbers; username 3-30 `[A-Za-z0-9_]`; password 8-64 chars with lower, upper, digit and symbol; history `limit` 1-100. `MAX_CONTENT_LENGTH` = 16 KB (413). | `app/schemas.py`, `config.py` |
| 7 | **Output escaping** | Jinja autoescaping on every template; the front-end builds answers, sources and logs with `textContent` / DOM nodes, never `innerHTML` with user or model text. | `templates/`, `static/js/ask.js`, `static/js/logs.js` |
| 8 | **Prompt-injection guard** | Regex patterns catch "ignore previous instructions", "reveal your system prompt", "you are now…", "developer mode", chat-template tags, etc. Such questions are refused **before** the LLM, saved with status `blocked` and logged as `prompt_injection_blocked`. The RAG prompt also tells the model to answer only from the numbered context. | `app/security.py` → `detect_prompt_injection`, `app/services/ask_flow.py` |
| 9 | **API keys hashed** | Keys are `tm_` + 32 random URL-safe chars; only their SHA-256 hash and an 8-char prefix are stored. The full key is shown once on regeneration (kept only in page memory) and regenerating revokes the old key. | `app/models.py` → `ApiKey`, `app/main/__init__.py` (`regenerate_key`), `static/js/api.js` |
| 10 | **Authentication & authorization** | Flask-Login sessions for the UI (all pages except login/register require login); `X-API-Key` (or `Authorization: Bearer`) for the API; admin-only Logs page (`admin_required` → 403). Users can only read their own conversations (others → 404). | `app/auth/`, `app/security.py`, `app/main/__init__.py` (`history_detail`) |
| 11 | **Secrets & config** | All settings come from the environment / `.env` (git-ignored); only `.env.example` is committed. `ProdConfig.validate()` refuses to start without a real `SECRET_KEY` (32+ chars, not the default). | `config.py`, `.env.example`, `.gitignore` |
| 12 | **Safe error handling** | Global handlers return friendly HTML or `{"error": {"code", "message"}}` JSON. Stack traces go only to the log, never to the user. The Flask debugger is off. | `app/errors.py` |
| 13 | **Logging & audit trail** | JSON-line logs with request id, user, route, status and latency; failed logins, invalid API keys, CSRF failures, 429s, 403s and blocked injections are logged as named events. Passwords and keys are never logged. | `app/logging_setup.py` |
| 14 | **Offline models** | `HF_HUB_OFFLINE=1`: models load only from the local Hugging Face cache; nothing is downloaded at runtime. | `app/services/rag_service.py` |
| 15 | **SQL injection** | SQLAlchemy ORM with bound parameters only (search uses `ilike` with a parameter). | `app/main/__init__.py` (`history`) |

## Known limits (local demo)
- Rate-limit counters are in memory (`memory://`); use Redis via `RATELIMIT_STORAGE_URI` when running several workers.
- The prompt-injection guard is pattern-based, so it is a first line of defence, not a guarantee.
- The dev server uses HTTP, so `Secure` cookies are only enabled in `ProdConfig` (deploy behind HTTPS).
