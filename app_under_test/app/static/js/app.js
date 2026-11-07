/* TripMind shared front-end: speed presets, ONE step controller (TM.player) for every demo + the tour,
   fetch with CSRF, toasts and safe renderers (answers with citation chips, source cards, JSON blocks). */
"use strict";

// ALL animation + tour timings live here (ms). Slow / Medium / Fast is shared by the tour and every page demo.
const SPEED = {
  slow:   { dwell: 5000, type: 28, stagger: 260, count: 1600, typeIn: 70, chart: 1400 },
  medium: { dwell: 3200, type: 12, stagger: 140, count: 1000, typeIn: 40, chart: 900 },
  fast:   { dwell: 1800, type: 4,  stagger: 60,  count: 500,  typeIn: 15, chart: 500 },
};

const TM = (window.TM = window.TM || {});
TM.reducedMotion = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
TM.$ = (sel, root) => (root || document).querySelector(sel);
TM.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
TM.el = function (tag, cls, text) {            // safe element builder: text always goes through textContent
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
TM.store = {
  get(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
TM.speedName = () => (SPEED[TM.store.get("tm-speed", "medium")] ? TM.store.get("tm-speed", "medium") : "medium");
TM.speed = function () {
  const s = Object.assign({}, SPEED[TM.speedName()]);
  if (TM.reducedMotion) Object.assign(s, { type: 0, stagger: 0, count: 0, typeIn: 0, chart: 0 });
  return s;
};
TM.csrf = () => (TM.$('meta[name="csrf-token"]') || {}).content || "";

/* =====================================================================================================
   TM.player: the single controller behind the bottom bar.
   A sequence is {title, steps: [{title, run(P, opts), undo?(), focus?()}], back?(index), onEnd?()}.
   Manual mode (default): one step per Next, then stop. Auto: steps advance after SPEED.dwell.
   Pause freezes P.wait() immediately (mid-animation) and CSS animations; Play resumes from the same point.
   ===================================================================================================== */
const P = (TM.player = {
  mode: TM.store.get("tm-mode", "manual") === "auto" ? "auto" : "manual",
  paused: false, playing: false, skipping: false, dwelling: false, advancing: false,
  seq: null, pageSeq: null, done: 0, running: null, runToken: 0, dwellToken: 0,
});

/** Pausable sleep: time only counts while not paused; resolves at once while a step is being skipped. */
P.wait = function (ms) {
  return new Promise((resolve) => {
    let left = ms || 0, last = performance.now();
    (function tick() {
      const now = performance.now();
      if (!P.paused) left -= now - last;
      last = now;
      if (left <= 0 || P.skipping) return resolve();
      setTimeout(tick, 30);
    })();
  });
};

P.load = function (seq) {
  P.runToken++; P.dwellToken++;
  P.seq = seq; P.done = 0; P.playing = false; P.paused = false; P.dwelling = false; P.running = null;
  P.render();
};
P.setPageSeq = function (seq) { P.pageSeq = seq; if (!TM.tourActive) P.load(seq); };

P.runAt = async function (idx, opts) {
  const seq = P.seq, step = seq && seq.steps[idx];
  if (!step) return;
  const my = ++P.runToken;
  P.done = idx + 1; P.paused = false;
  P.running = (async () => { try { await step.run(P, opts || {}); } catch (e) { console.warn("step failed", e); } })();
  P.render();
  await P.running;
  if (my !== P.runToken || seq !== P.seq) return;    // interrupted by Next/Back/load
  P.running = null; P.render();
  P.afterStep();
};

P.afterStep = async function () {
  if (P.mode !== "auto" || !P.playing || !P.seq) return;
  if (P.done >= P.seq.steps.length) { P.playing = false; P.render(); if (P.seq.onEnd) P.seq.onEnd(); return; }
  const my = ++P.dwellToken;
  P.dwelling = true; P.render();
  await P.wait(TM.speed().dwell * (P.seq.steps[P.done - 1].dwell || 1));
  if (my !== P.dwellToken) return;
  P.dwelling = false;
  if (P.playing && P.mode === "auto") P.next();
};

/** Finish the running step instantly (its waits resolve at once). Network calls still complete. */
P.finish = async function () {
  if (!P.running) return;
  P.skipping = true; P.paused = false;
  await P.running;
  P.skipping = false; P.running = null;
};
/** Finish the current step and every remaining step instantly (used before starting a new sequence). */
P.flush = async function () {
  if (!P.seq) return;
  P.runToken++; P.dwellToken++; P.playing = false;
  await P.finish();
  P.skipping = true;
  while (P.seq && P.done < P.seq.steps.length) { P.done++; try { await P.seq.steps[P.done - 1].run(P, {}); } catch (e) {} }
  P.skipping = false; P.render();
};

P.next = async function () {
  if (!P.seq || P.advancing) return;
  P.advancing = true; P.runToken++; P.dwellToken++; P.dwelling = false; P.render();
  await P.finish();
  P.advancing = false;
  if (P.done >= P.seq.steps.length) { P.playing = false; P.render(); if (P.seq.onEnd) P.seq.onEnd(); return; }
  P.runAt(P.done);
};

P.back = async function () {
  if (!P.seq || P.done <= 0 || P.advancing) return;
  P.advancing = true; P.runToken++; P.dwellToken++; P.dwelling = false; P.playing = false;
  await P.finish();
  P.advancing = false;
  if (P.seq.back) return P.seq.back(P.done - 2);      // the tour handles Back itself (may change page)
  const cur = P.seq.steps[P.done - 1];
  if (cur.undo) cur.undo();
  P.done -= 1;
  const prev = P.seq.steps[P.done - 1];
  if (prev && prev.focus) prev.focus();
  P.render();
};

P.isActive = () => !P.paused && !!(P.running || P.dwelling);
P.pause = function () {
  if (P.paused) return;
  P.paused = true; P.render();
  document.dispatchEvent(new CustomEvent("tm:pause"));
};
P.play = function () {
  const wasPaused = P.paused;
  P.paused = false;
  if (P.mode === "auto") P.playing = true;
  if (wasPaused) document.dispatchEvent(new CustomEvent("tm:resume"));
  if (!P.running && !P.dwelling) P.next();            // idle: start the next step
  P.render();
};
P.toggle = () => (P.isActive() ? P.pause() : P.play());
P.setMode = function (m) {
  P.mode = m; TM.store.set("tm-mode", m);
  if (m === "auto") P.play();
  else { P.playing = false; P.dwellToken++; P.dwelling = false; }
  P.render();
};
P.setSpeed = function (s) { TM.store.set("tm-speed", s); P.render(); };

P.render = function () {
  const $ = TM.$, seq = P.seq, n = seq ? seq.steps.length : 0;
  if (!$("#player")) return;
  $("#pl-back").disabled = !seq || P.done <= 0 || P.advancing;
  $("#pl-next").disabled = !seq || P.done >= n || P.advancing;
  $("#pl-play").disabled = !seq || (P.done >= n && !P.running);
  $("#pl-play").textContent = P.isActive() ? "⏸ Pause" : "▶ Play";
  $("#pl-play").classList.toggle("on", P.isActive());
  $("#pl-title").textContent = seq ? seq.title : "No demo on this page";
  $("#pl-step").textContent = seq ? `Step ${P.done} / ${n}` : "";
  TM.$$("#pl-mode button").forEach((b) => b.classList.toggle("on", b.dataset.mode === P.mode));
  TM.$$("#pl-speed button").forEach((b) => b.classList.toggle("on", b.dataset.speed === TM.speedName()));
  $("#pl-exit").hidden = !TM.tourActive;
  document.body.classList.toggle("tm-anim", P.isActive());
  document.body.classList.toggle("tm-paused", P.paused);
};

/* ---------- Animation helpers (all pausable through P.wait) ---------- */
TM.sleep = (ms) => P.wait(ms);

TM.countUp = async function (el) {
  const target = parseFloat(el.dataset.count || "0"), dec = parseInt(el.dataset.decimals || "0", 10), suf = el.dataset.suffix || "";
  const dur = TM.speed().count, tick = 30;
  for (let t = 0; t < dur && !P.skipping; t += tick) {
    el.textContent = (target * (1 - Math.pow(1 - t / dur, 3))).toFixed(dec) + suf;
    await P.wait(tick);
  }
  el.textContent = target.toFixed(dec) + suf;
};

/** Type text into an element (textContent only). Pause freezes it mid-word. */
TM.typeText = async function (el, text) {
  const ms = TM.speed().type;
  el.textContent = "";
  const node = document.createTextNode(""), caret = TM.el("span", "caret");
  el.append(node, caret);
  const chunk = Math.max(1, Math.round(text.length / 300));
  for (let i = 0; i < text.length && ms && !P.skipping; i += chunk) {
    node.data = text.slice(0, i + chunk);
    await P.wait(ms);
  }
  node.data = text; caret.remove();
};

/** Fill an input like a person typing (pausable). */
TM.typeInto = async function (input, text) {
  const ms = TM.speed().typeIn;
  input.value = "";
  if (!ms || text.length > 120) { input.value = text; }
  else for (const ch of text) { if (P.skipping) { input.value = text; break; } input.value += ch; input.dispatchEvent(new Event("input", { bubbles: true })); await P.wait(ms); }
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

/** Ring + scroll an element into the area above the control bar (page demos). */
TM.focusEl = function (el) {
  TM.$$(".tm-focus").forEach((x) => x.classList.remove("tm-focus"));
  if (!el) return;
  el.classList.add("tm-focus");
  el.scrollIntoView({ behavior: TM.reducedMotion || P.skipping ? "auto" : "smooth", block: "nearest" });
};

/* ---------- fetch JSON with the CSRF header ---------- */
TM.api = async function (url, opts) {
  opts = opts || {};
  const headers = Object.assign({ "X-Requested-With": "fetch", Accept: "application/json" }, opts.headers || {});
  if (opts.csrf !== false && opts.method && opts.method !== "GET") headers["X-CSRFToken"] = TM.csrf();
  let body = opts.body;
  if (body && typeof body !== "string") { body = JSON.stringify(body); headers["Content-Type"] = "application/json"; }
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(url, { method: opts.method || "GET", headers, body, credentials: opts.credentials || "same-origin" });
  } catch (e) {
    TM.toast("Network error", "Could not reach the server.", "error");
    return { ok: false, status: 0, data: { error: { code: "network", message: "Network error" } }, headers: new Headers(), ms: 0 };
  }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  const out = { ok: res.ok, status: res.status, data, headers: res.headers, ms: Math.round(performance.now() - t0) };
  if (res.status === 429 && !opts.quiet429) TM.toast("429 · Rate limit hit", TM.errorText(out), "error");
  return out;
};
TM.errorText = (res) => (res && res.data && res.data.error && res.data.error.message) || `Request failed (${res ? res.status : "?"})`;

/* ---------- Toasts (top-right, never near the control bar; max 3) ---------- */
TM.toast = function (title, text, kind) {
  const box = TM.$("#toasts");
  if (!box) return;
  while (box.children.length >= 3) box.firstChild.remove();
  const t = TM.el("div", "toast " + (kind || ""));
  const body = TM.el("div");
  body.append(TM.el("b", null, title));
  if (text) body.append(TM.el("span", "small muted", text));
  t.append(body);
  box.append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, 4500);
};

TM.copy = async function (text) {
  try { await navigator.clipboard.writeText(text); TM.toast("Copied", "Copied to clipboard.", "success"); }
  catch (e) { TM.toast("Copy failed", "Select and copy manually.", "error"); }
};

/* ---------- Safe renderers ---------- */
TM.icon = function (name) {                       // clones an inline SVG from the #tpl-icons <template>
  const t = TM.$("#tpl-icons"), svg = t && t.content.querySelector(`[data-icon="${name}"] svg`);
  return svg ? svg.cloneNode(true) : document.createTextNode("");
};

/** Source card: title, score bar, 3-line snippet with "Show more", Wikipedia link. */
TM.sourceCard = function (s) {
  const card = TM.el("article", "source"); card.dataset.n = s.n;
  const h = TM.el("header");
  h.append(TM.el("span", "cite", String(s.n)), TM.el("b", null, s.title), TM.el("span", "score", s.score.toFixed(2)));
  const bar = TM.el("div", "scorebar"), fill = TM.el("span");
  fill.style.width = Math.max(4, Math.min(100, s.score * 100)) + "%";
  bar.append(fill);
  const p = TM.el("p", "snippet", s.text);
  const more = TM.el("button", "linkbtn", "Show more"); more.type = "button";
  more.addEventListener("click", () => { const open = card.classList.toggle("expanded"); more.textContent = open ? "Show less" : "Show more"; });
  const a = TM.el("a", "small", "Wikipedia ↗"); a.href = s.url; a.target = "_blank"; a.rel = "noopener noreferrer";
  const foot = TM.el("div", "source-foot"); foot.append(more, a);
  const meta = TM.el("span", "muted small", `chunk #${s.chunk_id} · similarity ${s.score.toFixed(2)}`);
  card.append(h, bar, p, meta, foot);
  return card;
};

/** Answer text with numbered citation chips; clicking a chip expands that source's title + snippet inline. */
TM.renderAnswer = function (p, text, sources) {
  const clean = text.replace(/\[(\d)\]\*?([.!?]?)\s*\[\1\]\*?/g, "[$1]$2");      // "[2]*. [2]" -> "[2]."
  p.textContent = "";
  const panel = TM.el("div", "cite-panel"); panel.hidden = true;
  clean.split(/(\[\d\]\*?)/).forEach((part) => {
    const m = part.match(/^\[(\d)\](\*?)$/);
    if (!m) { p.append(document.createTextNode(part)); return; }
    const src = (sources || []).find((s) => String(s.n) === m[1]);
    const chip = TM.el("button", "cite" + (m[2] ? " auto" : ""), m[1]);
    chip.type = "button";
    chip.setAttribute("aria-label", `Source ${m[1]}${m[2] ? " (citation added automatically)" : ""}`);
    chip.addEventListener("click", () => {
      const same = !panel.hidden && panel.dataset.n === m[1];
      TM.$$(".cite.on", p).forEach((c) => c.classList.remove("on"));
      if (same || !src) { panel.hidden = true; return; }
      chip.classList.add("on");
      panel.dataset.n = m[1]; panel.textContent = "";
      const head = TM.el("div", "cite-panel-head");
      head.append(TM.el("span", "cite", m[1]), TM.el("b", null, src.title), TM.el("span", "muted small", `similarity ${src.score.toFixed(2)}${m[2] ? " · cited automatically" : ""}`));
      const a = TM.el("a", "small", "Open on Wikipedia ↗"); a.href = src.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      panel.append(head, TM.el("p", "snippet", src.text), a);
      panel.hidden = false;
    });
    p.append(chip);
  });
  const old = p.nextElementSibling;
  if (old && old.classList.contains("cite-panel")) old.remove();
  p.after(panel);
};

/** Syntax-highlighted JSON as DOM nodes (no innerHTML). */
TM.jsonNodes = function (value) {
  const frag = document.createDocumentFragment();
  const add = (cls, text) => frag.append(cls ? TM.el("span", "j-" + cls, text) : document.createTextNode(text));
  (function walk(v, ind) {
    const pad = "  ".repeat(ind);
    if (Array.isArray(v)) {
      if (!v.length) return add("p", "[]");
      add("p", "[\n");
      v.forEach((x, i) => { add(null, pad + "  "); walk(x, ind + 1); add("p", i < v.length - 1 ? ",\n" : "\n"); });
      add(null, pad); add("p", "]");
    } else if (v && typeof v === "object") {
      const keys = Object.keys(v);
      if (!keys.length) return add("p", "{}");
      add("p", "{\n");
      keys.forEach((k, i) => { add(null, pad + "  "); add("k", JSON.stringify(k)); add("p", ": "); walk(v[k], ind + 1); add("p", i < keys.length - 1 ? ",\n" : "\n"); });
      add(null, pad); add("p", "}");
    } else if (typeof v === "string") add("s", JSON.stringify(v.length > 400 ? v.slice(0, 400) + "…" : v));
    else if (typeof v === "number") add("n", String(v));
    else add("b", String(v));
  })(value, 0);
  return frag;
};

/* ---------- Layout + control bar wiring ---------- */
document.addEventListener("DOMContentLoaded", function () {
  const themeBtn = TM.$("#theme-btn");
  if (themeBtn) themeBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("tm-theme", next); } catch (e) {}
    document.dispatchEvent(new CustomEvent("tm:theme"));
  });
  const menu = TM.$("#menu-btn"), scrim = TM.$("#scrim");
  if (menu) menu.addEventListener("click", () => document.body.classList.toggle("nav-open"));
  if (scrim) scrim.addEventListener("click", () => document.body.classList.remove("nav-open"));

  TM.$("#pl-back").addEventListener("click", () => P.back());
  TM.$("#pl-next").addEventListener("click", () => P.next());
  TM.$("#pl-play").addEventListener("click", () => P.toggle());
  TM.$$("#pl-mode button").forEach((b) => b.addEventListener("click", () => P.setMode(b.dataset.mode)));
  TM.$$("#pl-speed button").forEach((b) => b.addEventListener("click", () => P.setSpeed(b.dataset.speed)));
  // mouse clicks don't focus bar buttons, so Space/arrows always go to the controller
  TM.$$("#player button, #tour-caption button").forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault()));
  document.addEventListener("keydown", (e) => {
    const a = document.activeElement, tag = (a && a.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (tag === "BUTTON" && a.closest("#player") && (e.code === "Space" || e.key === "Enter")) return;   // keyboard-focused bar button
    if (e.code === "Space") { e.preventDefault(); P.toggle(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); P.next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); P.back(); }
    else if (e.key === "Escape" && TM.tour && TM.tourActive) TM.tour.exit();
  });
  P.render();

  // Server flash messages -> toasts
  TM.$$("#flashes span").forEach((s) => TM.toast(s.dataset.cat === "success" ? "Success" : "Notice", s.textContent,
    s.dataset.cat === "success" ? "success" : s.dataset.cat === "error" ? "error" : ""));
});
