# Task 12: TripMind - Production-Ready GenAI Web App (VoidMain Internship)

## Goal
Brief: "Convert AI/GenAI capabilities into a complete user-facing application. Select one developed AI capability and integrate it into Flask/FastAPI. Include UI/API, persistence where required, authentication where appropriate, validation, logging, exception handling, configuration/secrets management and security considerations."
**Build exactly these production features, done properly. No extra features beyond this file. Runs locally. UI rules are in SHOWCASE.md. Finish by committing and pushing to GitHub.**

## AI capability (reuse, don't rebuild)
Productionize my **Task 8 RAG travel guide** (Indian tourist destinations, answers with sources, refuses unanswerable questions).
- Clone `https://github.com/Krishna141414/rag-travel-guide` into a temp folder, copy the RAG pipeline + `data/articles.json`, then delete the temp clone. Never modify that repo.
- If it doesn't exist, use `https://github.com/Krishna141414/semantic-search-embeddings` (articles + search code) and add the small generation step yourself.
- Put the RAG code behind one clean service module (`app/services/rag_service.py`) so the web layer never touches model code directly.

## Setup
- Windows, Python 3.14. Project in `D:\Projects\tripmind-genai-app` (NOT OneDrive). Keep `.venv`, `.env`, `instance/` (SQLite DB), `logs/`, `index/` and model cache out of git. Keep the empty `screenshots/` folder with `.gitkeep` (I add screenshots later).
- CPU-only PyTorch (`pip install torch --index-url https://download.pytorch.org/whl/cpu`) - NOT CUDA. Plus `transformers`, `sentence-transformers`, `faiss-cpu`, `flask`, `flask-sqlalchemy`, `flask-login`, `flask-wtf`, `flask-limiter`, `pydantic`, `python-dotenv`. Pin `requirements.txt`.
- LLM + embeddings: reuse the models already in `%USERPROFILE%\.cache\huggingface\hub` (e.g. Qwen2.5-0.5B-Instruct, all-MiniLM-L6-v2). **Download no new LLM.**

## LLM provider + fallback
`LLM_PROVIDER` in `.env`: `local` (default, the cached small model) or `extractive` (no LLM: answer = best matching sentences from the retrieved chunks, with citations).
- **Automatic fallback:** if the local LLM fails or times out -> use `extractive`, log it, and show a small "fallback answer" badge. The app must never crash because of the LLM.

## Production features (each must be clearly visible in code AND on the page)
1. **UI + API:**
   - Web UI (pages listed in SHOWCASE.md).
   - REST API `/api/v1/`: `POST /ask`, `GET /history`, `GET /health`. JSON in/out, consistent error format `{"error": {"code", "message"}}`. API auth with a per-user API key (shown on the API page, regenerable).
2. **Persistence:** SQLite via Flask-SQLAlchemy. Tables: `User`, `Conversation` (question, answer, sources JSON, status, latency, created_at), `ApiKey` (hashed). Seed a demo user `demo / Demo@1234` with a few example conversations (`flask seed`; also auto-seed on first start if the DB is empty).
3. **Authentication:** register / login / logout with Flask-Login; passwords hashed (werkzeug); login required for Ask/History/API/Logs; API uses the API key.
4. **Validation:** Pydantic schemas for all inputs (question 3-500 chars, no empty, username/password rules); clear field-level error messages on the page and in the API.
5. **Logging:** structured logs (JSON lines) with request id, user, route, status, latency, to `logs/app.log` + console. Errors logged with stack trace. An **admin Logs page** shows the latest entries (demo user is admin for the demo).
6. **Exception handling:** global error handlers (400/401/403/404/429/500) -> friendly HTML pages for the UI and JSON for the API; model/service failures caught -> "AI service unavailable, try again" (never a crash or stack trace to the user).
7. **Config & secrets:** `config.py` with Dev/Prod classes; everything from environment via `.env` (`SECRET_KEY`, `DATABASE_URL`, `LLM_PROVIDER`, `RATE_LIMIT`, `LOG_LEVEL`). Commit `.env.example` only; `.env` in `.gitignore`. App refuses to start in Prod config without a real `SECRET_KEY`.
8. **Security:** CSRF protection (Flask-WTF) on all forms; rate limiting (Flask-Limiter, e.g. 10 asks/min per user, stricter on login); secure session cookies (HttpOnly, SameSite); security headers (CSP, X-Frame-Options, X-Content-Type-Options); input length limits; output HTML-escaped; basic **prompt-injection guard** (detect "ignore previous instructions"-style input, refuse + log it); API keys stored hashed.
- Add a `SECURITY.md` listing every security measure and where it is in the code.

## Structure (app factory, blueprints)
```
app/__init__.py (create_app), config.py, extensions.py, models.py, schemas.py,
app/auth/ app/main/ app/api/ app/admin/ (blueprints), app/services/rag_service.py,
app/errors.py, app/logging_setup.py, app/security.py, templates/, static/
run.py, seed command, .env.example, requirements.txt, README.md, SECURITY.md,
screenshots/.gitkeep
```

## Quick check (`check_app.py`, not a test suite)
Using Flask's test client + one real run: register, login (good + wrong password), ask (answerable + unanswerable + too long + prompt injection), API with/without key, rate limit hit (429), 404, forced service error (500 page), LLM fallback. Save `results.md` with a small table of expected vs actual.

## README (checker-friendly)
1. Title + one-line description.
2. **Preview** section that shows the images from `screenshots/` (I'll add them later; link them so they appear once added).
3. Features: each production feature in 1-2 lines with the file it lives in.
4. Architecture diagram (Mermaid).
5. **How to run** - very clear numbered steps: clone, create venv, `pip install -r requirements.txt`, copy `.env.example` to `.env`, `flask seed`, `python run.py`, open `http://127.0.0.1:5000`, demo login `demo / Demo@1234`.
6. API examples (curl), results table, limitations (small local model, CPU speed).

## Rules
- Do everything in one go without asking. Keep code short, clean and commented.
- Run `check_app.py`, then start the app yourself and go through every page and the Guided Tour with real requests. Fix any error, stop the server.
- **Commit and push to GitHub (main).**
- Finish with a SHORT summary: results table + how to run + demo login. Then stop.
