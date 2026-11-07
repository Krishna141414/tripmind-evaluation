/* Guided Tour: a sequence for TM.player that spans pages. Starts only from a "Guided Tour" button, opens in
   Manual mode. Each step highlights one element and shows a caption card placed so it never covers the
   element or the control bar. State lives in sessionStorage so the tour survives page navigation. */
"use strict";
(function () {
  const $ = TM.$, P = TM.player;
  const KEY = "tm-tour";
  const loggedIn = document.body.dataset.auth === "1";
  const waitFor = async (sel, ms = 6000) => {
    for (let t = 0; t < ms; t += 100) { const e = $(sel); if (e) return e; await new Promise((r) => setTimeout(r, 100)); }
    return null;
  };
  const ask = (kind) => async () => { await waitFor(".chip"); await TM.askPage.runExample(kind, { playAll: true }); };

  // ---- The tour script (one array) ----
  const STEPS = [
    { page: "/auth/login", anon: true, el: "#login-card", req: "Authentication",
      text: "Sign in with Flask-Login. Passwords are stored hashed and the form carries a CSRF token.",
      action: async () => { await waitFor("#login-form"); await TM.fillDemo(true); } },
    { page: "/dashboard", el: "#stats", req: "Persistence",
      text: "These numbers are counted live from the SQLite database.",
      action: () => TM.dashboard.countUp() },
    { page: "/dashboard", el: "#chart-card", req: "Dashboard",
      text: "Answer outcomes and response times, drawn with Chart.js.",
      action: () => TM.dashboard.animate(0) },
    { page: "/ask", el: "#pipeline", req: "AI pipeline",
      text: "Every question runs Validate → Retrieve → Generate → Save, shown step by step here." },
    { page: "/ask", el: ".chat-card", req: "RAG answer with sources", dwell: 1.5,
      text: "An answerable question: Wikipedia chunks are retrieved and the local LLM answers with citation chips.",
      action: ask("answerable") },
    { page: "/ask", el: ".chat-card", req: "Refuses unanswerable questions",
      text: "Nothing relevant in the documents (score < 0.50), so the LLM is skipped and the app says so.",
      action: ask("unanswerable") },
    { page: "/ask", el: ".composer", req: "Validation (Pydantic)",
      text: "A 600-character question breaks the 3–500 rule: a clear field error, nothing saved.",
      action: ask("too-long") },
    { page: "/ask", el: ".chat-card", req: "Prompt-injection guard",
      text: "“Ignore previous instructions…” is refused before the LLM, saved as blocked and logged.",
      action: ask("injection") },
    { page: "/history", el: "#history-card", req: "Persistence · History",
      text: "Every conversation is saved in SQLite. Search filters it instantly; each row opens its details.",
      action: async () => { await TM.typeInto($("#history-q"), "munnar"); } },
    { page: "/developer", el: "#key-card", req: "API key",
      text: "Regenerate your key: it is shown once and only its SHA-256 hash is stored.",
      action: () => TM.apiPage.regenerate() },
    { page: "/developer", el: "#playground", req: "REST API",
      text: "A valid POST /api/v1/ask with the key: JSON in, a tidy summary out (raw JSON is collapsed).",
      action: async () => { if (!TM.apiPage.hasKey()) await TM.apiPage.regenerate(); await TM.apiPage.run("valid"); } },
    { page: "/developer", el: "#playground", req: "API errors",
      text: "No key → 401 with the same error shape everywhere: an error code and a message.",
      action: () => TM.apiPage.run("nokey") },
    { page: "/security", el: "#card-ratelimit", req: "Rate limiting",
      text: "11 quick requests against a 10-per-minute rule: the 11th is rejected with 429.",
      action: () => TM.securityPage.run("ratelimit") },
    { page: "/admin/logs", el: "#logs-card", req: "Structured logging",
      text: "JSON-line logs shown as a table: time, level, event, message. Security events are highlighted.",
      action: async () => { await waitFor("#logs-body tr"); await TM.logsPage.setSecurity(true); } },
    { page: "/security", el: "#card-headers", req: "Security headers",
      text: "Every response carries CSP, X-Frame-Options, nosniff, Referrer-Policy and a request id.",
      action: () => TM.securityPage.run("headers") },
    { page: "/tour/missing-page", el: "#error-card", req: "Error handling",
      text: "Unknown pages get a friendly 404 (429 and 500 look the same). Stack traces only go to the log." },
    { page: "/how-it-works", el: "#arch", req: "How it works",
      text: "Security layer → blueprints → ask flow → RAG service (with fallback) → SQLite + logs. Tour complete!",
      action: () => TM.howPage.lightAll() },
  ];

  const spot = $("#tour-spot"), cap = $("#tour-caption");
  let target = null, follow = null;

  /* ---------- caption + spotlight placement ---------- */
  function bounds() {
    const bar = $("#player").getBoundingClientRect();
    return { top: 12, bottom: bar.top - 14, gap: 14 };
  }
  function scrollFor(el) {                         // put element (+ room for the caption) in the free area
    const b = bounds(), r = el.getBoundingClientRect(), ch = cap.offsetHeight + b.gap, usable = b.bottom - b.top;
    const desired = r.height + ch <= usable ? b.top + (usable - r.height - ch) / 2 : b.top + 6;
    window.scrollBy({ top: r.top - desired, behavior: "auto" });
  }
  function place() {
    const b = bounds(), W = innerWidth, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    cap.style.width = "";                                          // default width (CSS), measured below
    let cw = cap.offsetWidth, ch = cap.offsetHeight;
    if (!target || !document.body.contains(target)) {
      spot.hidden = true;
      Object.assign(cap.style, { left: (W - cw) / 2 + "px", top: b.bottom - ch + "px" });
      return;
    }
    const r = target.getBoundingClientRect(), pad = 6;
    const sTop = clamp(r.top - pad, b.top - pad, b.bottom), sBot = clamp(r.bottom + pad, b.top, b.bottom);
    spot.hidden = sBot - sTop < 8;
    Object.assign(spot.style, { left: r.left - pad + "px", top: sTop + "px", width: r.width + pad * 2 + "px", height: sBot - sTop + "px" });
    let top, left = null;
    const side = (space) => {                                      // narrow the card to fit beside the target
      cap.style.width = Math.min(cw, space) + "px"; ch = cap.offsetHeight;
      return clamp(r.top, b.top, b.bottom - ch);
    };
    const rightSpace = W - r.right - pad - 2 * b.gap, leftSpace = r.left - pad - 2 * b.gap;
    if (b.bottom - r.bottom - pad >= ch + b.gap) top = r.bottom + pad + b.gap;               // below
    else if (r.top - pad - b.top >= ch + b.gap) top = r.top - pad - b.gap - ch;              // above
    else if (Math.max(rightSpace, leftSpace) >= 220) {                                         // beside (right, else left)
      if (rightSpace >= leftSpace) { top = side(rightSpace); left = r.right + pad + b.gap; }
      else { top = side(leftSpace); left = r.left - pad - b.gap - Math.min(cw, leftSpace); }
    } else top = b.top;                                                                        // tiny screens only
    if (left == null) left = clamp(r.left, 12, W - cap.offsetWidth - 12);
    Object.assign(cap.style, { left: left + "px", top: Math.min(top, b.bottom - ch) + "px" });
  }
  function show(step, i) {
    $("#tour-req").textContent = step.req;
    $("#tour-text").textContent = step.text;
    $("#tour-cap-step").textContent = `${i + 1} / ${STEPS.length}`;
    cap.hidden = false;
    target = $(step.el);
    if (target) scrollFor(target);
    place();
    clearInterval(follow); follow = setInterval(place, 120);   // follows answers that grow, resizes, scrolling
  }

  /* ---------- navigation between pages ---------- */
  async function go(step, i, noAction) {
    TM.store.set(KEY, { active: true, done: i + 1, pendingRun: true, noAction: !!noAction, playing: P.playing });
    cap.hidden = true; spot.hidden = true;
    if (step.anon && loggedIn) {                                 // the login step needs a signed-out session
      await TM.api("/auth/logout", { method: "POST" });
      location.href = step.page;
    } else if (!step.anon && !loggedIn && $("#login-form")) {    // sign in with the demo account through the real form
      if (!$("#login-form").elements.username.value) await TM.fillDemo(false);
      $("#login-form").submit();
    } else location.href = step.page;
    await new Promise(() => {});                                 // page is unloading
  }

  const seq = {
    title: "Guided Tour",
    steps: STEPS.map((step, i) => ({
      dwell: step.dwell,
      async run(P, opts) {
        if (location.pathname !== step.page) return go(step, i, opts.noAction);
        TM.store.set(KEY, { active: true, done: i + 1, playing: P.playing });
        show(step, i);
        await P.wait(TM.speed().stagger * 2);
        if (step.action && !opts.noAction) {
          try { await step.action(); } catch (e) { console.warn("tour action failed", e); }
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
          target = $(step.el); place();
        }
      },
    })),
    back(index) {                                    // show the previous step again (without redoing its action)
      if (index < 0) return;
      const step = STEPS[index];
      P.done = index + 1; P.render();
      if (location.pathname !== step.page) go(step, index, true);
      else { TM.store.set(KEY, { active: true, done: index + 1 }); show(step, index); }
    },
    onEnd() { TM.toast("Tour complete", "Every production feature was shown live. Press Exit tour to close.", "success"); },
  };

  function start() {
    P.setMode("manual");
    TM.tourActive = true;
    P.load(seq);
    P.runAt(0);
  }
  function exit() {
    TM.tourActive = false;
    TM.store.set(KEY, null);
    clearInterval(follow); target = null;
    cap.hidden = true; spot.hidden = true;
    P.load(P.pageSeq || null);
  }

  TM.$$("[data-tour-start]").forEach((b) => b.addEventListener("click", start));
  $("#tour-exit").addEventListener("click", exit);
  $("#pl-exit").addEventListener("click", exit);
  addEventListener("resize", () => TM.tourActive && place());
  TM.tour = { start, exit, steps: STEPS };

  // ---- resume after navigation (page scripts below register their helpers first) ----
  const state = TM.store.get(KEY, null);
  if (state && state.active) {
    TM.tourActive = true;
    P.load(seq);
    const idx = Math.max(0, (state.done || 1) - 1);
    P.done = idx;
    if (state.playing && P.mode === "auto") P.playing = true;
    window.addEventListener("load", () => P.runAt(idx, { noAction: !state.pendingRun || state.noAction }));
  }
})();
