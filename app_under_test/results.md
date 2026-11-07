# check_app.py results

Flask test client + real RAG pipeline (local Qwen2.5-0.5B on CPU). **28/28 passed** in 46 s.

| # | Check | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | Register (valid) | 302 -> /dashboard, user saved | 302 -> /dashboard | PASS |
| 2 | Register (invalid input) | 400 + field errors | 400, username+password errors shown | PASS |
| 3 | Login required for Ask | 302 -> /auth/login | 302 -> /auth/login?next=%2Fask | PASS |
| 4 | Login (wrong password) | 400 'Invalid username or password' | 400 | PASS |
| 5 | Login (good password) | 302 -> /dashboard | 302 -> /dashboard | PASS |
| 6 | Password stored hashed | scrypt hash, not plain text | scrypt:32768:8:1 | PASS |
| 7 | Ask answerable (real local LLM run) | 201 answered + 3 sources, saved | 201 answered via local, 3 sources, 26.9s | PASS |
| 8 | Ask unanswerable | not_found, LLM skipped | 201 not_found via retrieval | PASS |
| 9 | Ask too long (600 chars) | 422 validation_error on field 'question' | 422 validation_error: question - Must be at most 500 characters | PASS |
| 10 | Prompt injection | refused (blocked) + logged | 201 blocked, logged=True | PASS |
| 11 | API without key | 401 {error:{code,message}} | 401 missing_api_key | PASS |
| 12 | API with invalid key | 401 invalid_api_key | 401 invalid_api_key | PASS |
| 13 | API with key (POST /ask) | 201 answered | 201 answered via local | PASS |
| 14 | API GET /history | 200, own conversations | 200, 5 items, total 8 | PASS |
| 15 | API GET /health | 200 ok | 200 ok | PASS |
| 16 | API key stored hashed | SHA-256 only | len 64, plain stored=False | PASS |
| 17 | Rate limit (10/min per key) | requests 1-10 -> 422, 11th -> 429 | 10x422 then 429 (rate_limited) | PASS |
| 18 | Login brute force (5/min per IP) | attempts 1-5 -> 400, 6th -> 429 | [400, 400, 400, 400, 400, 429] | PASS |
| 19 | 404 page (UI) | friendly HTML 404 | 404, html=True | PASS |
| 20 | 404 (API) | JSON {error:{code:not_found}} | 404 not_found | PASS |
| 21 | Forced service error | friendly 500 page, no traceback shown, stack logged | 500, traceback shown=False, stack logged=True | PASS |
| 22 | AI service failure | 503 ai_service_unavailable | 503 AI service unavailable, try again. | PASS |
| 23 | Admin page for non-admin | 403 | 403 | PASS |
| 24 | Security headers | CSP, X-Frame-Options, nosniff | XFO=DENY, XCTO=nosniff, CSP=yes | PASS |
| 25 | CSRF (POST without token) | 400 csrf_failed | 400 csrf_failed | PASS |
| 26 | Prod config without real SECRET_KEY | refuses to start | refused | PASS |
| 27 | LLM failure -> fallback | answered via extractive, fallback badge | answered via extractive, fallback=True | PASS |
| 28 | LLM timeout -> fallback | fallback (reason timeout) | extractive, reason=timeout | PASS |
