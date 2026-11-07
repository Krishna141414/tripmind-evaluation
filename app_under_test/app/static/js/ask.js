/* Ask page: sends the question, then reveals the result as control-bar steps:
   1 Validate · 2 Retrieve (source cards) · 3 Generate (answer with citation chips) · 4 Save.
   Manual mode waits for Next at every step; Auto plays through; Pause freezes mid-animation. */
"use strict";
(function () {
  const P = TM.player, $ = TM.$;
  const MAX = parseInt($("#ask-js").dataset.max, 10);
  const form = $("#ask-form"), q = $("#question"), btn = $("#ask-btn"), chat = $("#chat");
  const counter = $("#counter"), qErr = $("#question-error"), hint = $("#pipe-hint");
  let busy = false;

  /* ---------- live validation ---------- */
  function liveCheck() {
    counter.textContent = `${q.value.length} / ${MAX}`;
    counter.classList.toggle("over", q.value.length > MAX);
    qErr.textContent = q.value.length > MAX ? `Too long: ${q.value.length} characters (max ${MAX}). The server will reject it.` : "";
    q.classList.toggle("invalid", q.value.length > MAX);
  }
  q.addEventListener("input", liveCheck);
  q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  /* ---------- pipeline strip ---------- */
  const STEPS = ["validate", "retrieve", "generate", "save"];
  const stepEl = (s) => $(`.pipe-step[data-step="${s}"]`);
  const defaults = Object.fromEntries(STEPS.map((s) => [s, $("[data-ms]", stepEl(s)).textContent]));
  function setStep(s, state, label) {
    const el = stepEl(s);
    el.classList.remove("active", "done", "skipped", "warn", "error", "waiting");
    if (state) el.classList.add(state);
    $("[data-ms]", el).textContent = label || defaults[s];
    const line = el.previousElementSibling;
    if (line && line.classList.contains("pipe-line")) line.classList.toggle("done", !!state && !["skipped", "error", "waiting"].includes(state));
  }
  const resetStrip = (state) => STEPS.forEach((s) => setStep(s, state || null));
  function setHint(text, kind) { hint.textContent = text; hint.className = "pipe-hint " + (kind || ""); }

  /* ---------- messages ---------- */
  const scroll = () => { chat.scrollTop = chat.scrollHeight; };
  function badge(cls, ic, text) { const b = TM.el("span", "badge " + cls); b.append(TM.icon(ic), text); return b; }
  function addUser(text) {
    const empty = $("#chat-empty"); if (empty) empty.remove();
    const m = TM.el("div", "msg msg-user");
    const name = ($(".user-meta b") || {}).textContent || "U";
    m.append(TM.el("span", "avatar sm", name[0].toUpperCase()), TM.el("p", null, text.length > 160 ? text.slice(0, 160) + `… (${text.length} characters)` : text));
    chat.append(m); scroll();
  }
  function addAssistant() {
    const m = TM.el("div", "msg msg-ai");
    const parts = { root: m, meta: TM.el("div", "msg-meta"), note: TM.el("p", "msg-note"), answer: TM.el("p", "answer"), sources: TM.el("div", "sources") };
    parts.skeleton = TM.el("div", "skeleton");
    parts.skeleton.append(TM.el("div", "skeleton-line"), TM.el("div", "skeleton-line"), TM.el("div", "skeleton-line"));
    parts.note.textContent = "Working… the local CPU model can take 15–30 seconds.";
    m.append(parts.meta, parts.note, parts.skeleton, parts.answer, parts.sources);
    parts.answer.hidden = true;
    chat.append(m); scroll();
    return parts;
  }

  /* ---------- reveal sequence for one response ---------- */
  function revealSeq(parts, res, question) {
    const d = res.ok ? res.data.data : null, t = res.ok ? res.data.timings : null;
    const m = parts.root;
    const note = (text) => { parts.note.textContent = text; };
    const clearPanel = () => { const p = parts.answer.nextElementSibling; if (p && p.classList.contains("cite-panel")) p.remove(); };

    if (!res.ok) {                                   // one friendly error step, never raw JSON
      const err = (res.data && res.data.error) || { code: "error", message: TM.errorText(res) };
      const field = err.details && err.details[0];
      const where = res.status === 503 ? "retrieve" : "validate";
      return { title: "Answer reveal", reveal: true, steps: [{
        title: "Validate",
        run: async () => {
          if (where === "retrieve") setStep("validate", "done");
          setStep(where, "error", res.status === 503 ? "AI service unavailable" : `rejected (${res.status})`);
          m.classList.add("msg-error");
          parts.meta.textContent = "";
          parts.meta.append(badge("badge-error", "alert", res.status === 422 ? "Validation error" : res.status === 429 ? "Too many requests" : res.status === 503 ? "AI service unavailable" : "Request failed"));
          note(field ? `${field.field === "question" ? "Question" : field.field}: ${field.message}.` : err.message);
          if (field) { qErr.textContent = field.message; q.classList.add("invalid"); }
          setHint(res.status === 422 ? "Nothing was saved: the server rejected the input (HTTP 422)." : `The request failed (HTTP ${res.status}).`, "bad");
          if (res.status !== 429) TM.toast(res.status === 422 ? "Validation error" : "Error " + res.status, field ? field.message : err.message, "error");
        },
        undo: () => { resetStrip(); m.classList.remove("msg-error"); parts.meta.textContent = ""; note("Response ready: press Next ⏭ to reveal it."); },
      }] };
    }

    const blocked = d.status === "blocked", noLlm = d.provider === "retrieval";
    return { title: "Answer reveal", reveal: true, steps: [
      { title: "Validate",
        run: async () => {
          setStep("validate", "active"); await P.wait(TM.speed().stagger * 2);
          setStep("validate", blocked ? "warn" : "done", blocked ? "injection blocked" : `${t.validate_ms} ms`);
          note(blocked ? "Step 1 · Validate: the prompt-injection guard matched this question, so it stops here."
                       : "Step 1 · Validate: 3–500 characters and no prompt-injection patterns. ✓");
          setHint("Step 1 of 4 done. Next ⏭ to retrieve sources.");
        },
        undo: () => { setStep("validate", null); note("Response ready: press Next ⏭ to reveal it step by step."); } },
      { title: "Retrieve",
        run: async () => {
          if (blocked) { setStep("retrieve", "skipped", "skipped (blocked)"); note("Step 2 · Retrieve: skipped, the question was blocked."); }
          else {
            setStep("retrieve", "active"); await P.wait(TM.speed().stagger * 2);
            setStep("retrieve", "done", `${t.retrieve_ms} ms · top ${d.sources.length}`);
            const best = d.sources[0] ? d.sources[0].score : 0;
            note(`Step 2 · Retrieve: ${d.sources.length} chunks found, best similarity ${best.toFixed(2)} (needs ≥ 0.50).`);
            parts.skeleton.hidden = true;
            for (const s of d.sources) { const c = TM.sourceCard(s); parts.sources.append(c); scroll(); await P.wait(TM.speed().stagger); c.classList.add("in"); }
          }
          setHint("Step 2 of 4 done. Next ⏭ to generate the answer.");
        },
        undo: () => { setStep("retrieve", null); parts.sources.textContent = ""; parts.skeleton.hidden = false; } },
      { title: "Generate",
        run: async () => {
          parts.skeleton.hidden = true; parts.answer.hidden = false;
          if (blocked) setStep("generate", "skipped", "skipped (blocked)");
          else if (noLlm) setStep("generate", "skipped", "skipped · score < 0.50");
          else { setStep("generate", "active"); await P.wait(TM.speed().stagger * 2);
                 setStep("generate", d.fallback ? "warn" : "done", (d.fallback ? "fallback · " : "") + (t.generate_ms / 1000).toFixed(1) + " s"); }
          note(blocked ? "Step 3 · Generate: the LLM was never called." : noLlm ? "Step 3 · Generate: not in the documents, so the LLM was skipped."
               : d.fallback ? `Step 3 · Generate: the local LLM failed (${d.fallback_reason}), so the best source sentences were used.`
               : "Step 3 · Generate: the local LLM wrote the answer from the sources. Click a number chip to see its source.");
          await TM.typeText(parts.answer, d.answer.replace(/\[(\d)\]\*?/g, "[$1]"));
          TM.renderAnswer(parts.answer, d.answer, d.sources);
          scroll();
          setHint("Step 3 of 4 done. Next ⏭ to save it.");
        },
        undo: () => { setStep("generate", null); parts.answer.textContent = ""; parts.answer.hidden = true; clearPanel(); if (!parts.sources.children.length) parts.skeleton.hidden = false; } },
      { title: "Save",
        run: async () => {
          setStep("save", "done", "saved #" + d.id);
          parts.meta.textContent = "";
          if (d.status === "answered") parts.meta.append(badge("badge-success", "check", "Answered"));
          else if (d.status === "not_found") parts.meta.append(badge("badge-warn", "search", "Not in documents"));
          else if (blocked) { parts.meta.append(badge("badge-error", "shield", "Blocked: prompt injection")); m.classList.add("msg-blocked"); }
          if (d.fallback) parts.meta.append(badge("badge-warn", "zap", "Fallback answer"));
          parts.meta.append(TM.el("span", "tag", d.provider), badge("", "clock", (d.latency_ms / 1000).toFixed(2) + " s"));
          const link = TM.el("a", "small", "Saved as #" + d.id); link.href = "/history/" + d.id; parts.meta.append(link);
          note(`Step 4 · Save: stored in SQLite as conversation #${d.id} (see History).`);
          setHint("All 4 steps shown. Ask another question or pick a “Try” button.", "ok");
          if (blocked) TM.toast("Prompt injection blocked", "Refused and logged.", "warn");
          if (d.fallback) TM.toast("Fallback answer", "The local LLM failed, so an extractive answer was used.", "warn");
          scroll();
        },
        undo: () => { setStep("save", null); parts.meta.textContent = ""; m.classList.remove("msg-blocked"); } },
    ] };
  }

  /** Ask a question. opts.playAll plays every reveal step inside the caller (used by the tour). */
  async function ask(text, opts) {
    opts = opts || {};
    if (busy) return;
    if (P.seq && P.seq.reveal) await P.flush();        // finish a half-revealed previous answer instantly
    busy = true; btn.disabled = true;
    qErr.textContent = ""; q.classList.remove("invalid");
    resetStrip("waiting");
    setHint("Working… waiting for the server (the CPU model can take 15–30 s).", "busy");
    addUser(text);
    const parts = addAssistant();
    const res = await TM.api("/ask", { method: "POST", body: { question: text, simulate_llm_failure: !!opts.simulate } });
    busy = false; btn.disabled = false;
    resetStrip();
    parts.note.textContent = "Response ready: press Next ⏭ to reveal it step by step.";
    const seq = revealSeq(parts, res, text);
    if (opts.playAll || TM.tourActive) {
      for (const s of seq.steps) { await s.run(P); await P.wait(TM.speed().stagger * 3); }
    } else {
      P.load(seq);
      setHint(P.mode === "auto" ? "Playing the steps… (Pause to freeze)" : `Answer ready: press Next ⏭ to reveal step 1 of ${seq.steps.length}.`, "ready");
      if (P.mode === "auto") P.play();
    }
    if (res.ok) { q.value = ""; liveCheck(); }
    return res;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!q.value.trim()) { qErr.textContent = "Please type a question first."; q.classList.add("invalid"); return; }
    ask(q.value);
  });

  /** A "Try" button: fill the box and run it. */
  async function runExample(kind, opts) {
    const chip = $(`.chip[data-kind="${kind}"]`);
    if (!chip || busy) return;
    q.value = chip.dataset.q; liveCheck();
    return ask(chip.dataset.q, Object.assign({ simulate: chip.dataset.simulate === "1" }, opts || {}));
  }
  TM.$$(".chip").forEach((c) => c.addEventListener("click", () => runExample(c.dataset.kind)));
  TM.askPage = { ask, runExample, isBusy: () => busy };
  liveCheck();
})();
