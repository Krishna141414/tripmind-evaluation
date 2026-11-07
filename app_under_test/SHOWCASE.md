# SHOWCASE.md - Task 12 "TripMind" UI + Guided Tour (follow exactly)

This is a real multi-page app, not one long scrolling page. Each production feature has its own page/tab with ready-made examples, plus a Guided Tour that walks through everything.

## Theme - polished SaaS product (color-matched, not a rainbow demo)
- Palette: background `#F7F9FC`, surface white `#FFFFFF`, sidebar deep navy `#0F1E3D` -> `#13264D` subtle gradient, text `#0F172A` / muted `#64748B`, primary blue `#2563EB` with an indigo accent `#6366F1` (used together only as a soft gradient on primary buttons, active nav item and the login hero), warm amber `#F59E0B` for highlights/warnings, success `#16A34A`, error `#DC2626`. Borders `#E2E8F0`. Dark mode toggle uses navy surfaces with the same accents.
- Inter font, clear type scale, 8px spacing grid, 12-16px rounded cards with soft layered shadows, lucide-style SVG icons inline.
- **Animations (smooth, professional):** login page with a slow animated blue-indigo gradient mesh + product preview card; page transitions (fade + slight slide) between sidebar pages; count-up stat tiles and animated Chart.js charts on the dashboard; chat messages slide in, answer appears with a typing effect, source cards stagger in; skeleton loaders while the AI works; toast notifications (success/error/429); hover lift on cards and buttons; the Ask pipeline strip animates Validate -> Retrieve -> Generate -> Save step by step. Never flashy or noisy.
- Plain HTML (Jinja templates) + CSS + vanilla JS (+ Chart.js from CDN). No frameworks. Fully responsive (sidebar collapses on mobile).

## Pages (sidebar navigation)
1. **Login / Register** - forms with live validation messages; "Use demo account" button fills `demo / Demo@1234`.
2. **Dashboard** - welcome, stats tiles (questions asked, answered vs not-in-docs, avg response time), recent conversations, small chart.
3. **Ask TripMind** - chat-style RAG: question box + example chips (answerable, unanswerable, too long, prompt-injection attempt). Answer with sources cards + status badge. A small "pipeline" strip shows Validate -> Retrieve -> Generate -> Save as it happens.
4. **History** - saved conversations from the database (search + open details) -> proves persistence.
5. **API** - API key (masked, copy, regenerate), endpoint list, and an **API playground**: pick an example request (valid, missing key, invalid body), send it, see the JSON response + status code.
6. **Admin -> Logs** - live table of structured log lines (request id, user, route, status, latency), filter by level; highlights errors and blocked prompt-injection attempts.
7. **Security** - one card per security measure (hashed passwords, CSRF, rate limiting, secure cookies, headers, input limits, prompt-injection guard, secrets in .env) each with a **"Try it" button** that demonstrates it live (e.g. send 11 quick requests -> 429 toast; submit a form without CSRF token -> blocked; show response headers).
8. **How it works** - architecture diagram (boxes/arrows), production-feature -> file table, short code snippets.
- Friendly custom error pages (404, 429, 500) styled like the app.

## Guided Tour (important)
- A floating tour bar at the bottom: **Start Tour, ◀ Back, ⏸ Pause / ▶ Play, Next ▶, step "3 / 18", speed Slow / Medium / Fast (default Medium), Exit**.
- The tour script (one JSON/JS array) visits every page in order and, for each step: navigates to the page, spotlights the element (dim the rest + highlight box), shows a caption naming **which requirement this proves** (e.g. "Persistence: every answer is saved in SQLite"), and performs the action automatically (fill example input, click, show result).
- Auto mode advances at the chosen speed (Medium ≈ 3-4 s per step, longer for steps that wait for the AI). Pause stops on the current step; Next/Back move manually. Keyboard: Space = pause/play, arrows = back/next.
- Covers in order: login -> dashboard -> ask (answerable) -> ask (unanswerable) -> validation error -> prompt-injection blocked -> history -> API playground (valid + missing key) -> rate limit 429 -> logs -> security headers -> error page -> how it works.
- Tour state survives page navigation (store step in sessionStorage).

## Speed
All animation/tour timings in ONE `const SPEED = {...}` object; Slow / Medium / Fast toggle shared by the tour and in-page animations. Respect `prefers-reduced-motion`.

## Done means
Start the server yourself, log in as demo, click through every page and every "Try it", run the full Guided Tour (auto + pause + manual), with real responses and no server errors. Commit and push.
