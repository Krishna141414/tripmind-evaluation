# SHOWCASE.md - Task 13 "Safety Lab" page (follow exactly)

A tabbed web app (NOT one long scroll) that shows how TripMind was evaluated, what failed, and how the safeguards fixed it. Only build what is here.

## Theme - "Safety Lab"
- Background `#0F172A` (slate), surfaces `#1E293B`, text soft white / muted `#94A3B8`. Accents: emerald `#10B981` (pass), crimson `#E11D48` (fail / attack), sky `#0EA5E9` (primary, info), amber `#F59E0B` (warning / partially passed).
- Inter font + monospace for inputs/outputs. Rounded cards, soft glow on active items, shield/check/x icons (inline SVG). Plain HTML/CSS/JS + Chart.js from CDN, no frameworks, responsive.

## Tabs
1. **Overview** - "Task 13 - Evaluation, Testing & AI Safety" badge, one sentence ("We stress-tested TripMind with 50 cases across 6 risk areas, then added safeguards and measured again"), headline count-up tiles (cases, baseline pass %, safeguarded pass %, issues fixed) and the 6 requirement cards (Answer quality, Grounding, Hallucinations, Invalid inputs, Prompt injection, Tool failures) + "Limitations & safeguards" -> each opens its tab section.
2. **Evaluation Set** - table of all cases, filter chips by category, each row shows input, expected behavior, expected source.
3. **Run Tests** (main demo) - choose Baseline or Safeguarded, click "Run" -> test cards appear one by one and flip to PASS (green) / FAIL (red) with a one-line reason; a live progress bar and per-category counters fill up. Uses the saved real results (instant); optional "Run live" if the backend is running.
4. **Results** - Chart.js: pass rate per category (baseline vs safeguarded bars), groundedness distribution, latency; plus the summary table.
5. **Test Explorer** - click any case -> side by side Baseline vs Safeguarded: input, retrieved sources, output, groundedness score, pass/fail + why. Highlight unsupported (possibly hallucinated) sentences in red.
6. **Attack Lab** - prompt-injection and adversarial examples as buttons + a text box: show the attack, which safeguard caught it (tag), and the safe response. Also "simulate failure" buttons (LLM down, timeout, index missing) showing the graceful fallback.
7. **Safeguards** - one card per safeguard (what it does, file/function, before -> after numbers), with a toggle to show the same example with safeguard off vs on.
8. **Report & Limitations** - the report rendered nicely (sections from EVALUATION_REPORT.md), limitations list, and a "Print / Save as PDF" button with a clean print stylesheet.

## Guided Tour
Floating bar: **Start Tour, ◀ Back, ⏸ Pause / ▶ Play, Next ▶, step "4 / 16", speed Slow / Medium / Fast (default Medium), Exit**. One tour script visits every tab in order; each step switches tab, spotlights the element (dim the rest), shows a caption naming which requirement it proves, and performs the action (runs tests, opens a case, fires an attack, toggles a safeguard). Space = pause/play, arrows = back/next.

## Speed
Medium pace: ~1.5-2 s between steps, test cards ~0.4-0.6 s apart while running, fades ~0.6-0.8 s, count-ups/charts ~1.2-1.5 s. All timings in ONE `const SPEED = {...}`; Slow/Medium/Fast toggle shared by the tour and animations. Respect `prefers-reduced-motion`.

## Data
`app.py` (Flask) serves the page and the saved results JSON; "Run live"/Attack Lab text box call the real app_under_test when available, otherwise use saved results.

## Done means
Start the server yourself, open every tab, run tests in both versions, open several cases, fire attacks, toggle safeguards, run the full Guided Tour (auto + pause + manual). No server errors. Commit and push.
