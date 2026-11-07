/* API page: key regenerate/copy (shown once) + playground calling the real /api/v1 endpoints.
   Responses show a readable summary; the raw JSON sits in a collapsed, highlighted block with Copy. */
"use strict";
(function () {
  const P = TM.player, $ = TM.$;
  const box = $("#key-box"), reveal = $("#key-reveal"), copy = $("#key-copy");
  let plainKey = null, shown = false;              // the plain key lives only in this page's memory
  const mask = (k) => k.slice(0, 8) + "•".repeat(24);

  async function regenerate() {
    const res = await TM.api("/developer/regenerate", { method: "POST" });
    if (!res.ok) return TM.toast("Could not regenerate", TM.errorText(res), "error");
    plainKey = res.data.key; shown = true;
    box.textContent = plainKey; box.classList.add("fresh");
    reveal.disabled = copy.disabled = false;
    $("#key-note").textContent = "New key created. Copy it now: only its SHA-256 hash is stored, so it can't be shown again after you leave this page. The old key no longer works.";
    $("#curl-key").textContent = plainKey;
    TM.toast("API key regenerated", "Old key revoked. New key shown once.", "success");
    load(current);
    return plainKey;
  }
  $("#key-regen").addEventListener("click", regenerate);
  reveal.addEventListener("click", () => { if (!plainKey) return; shown = !shown; box.textContent = shown ? plainKey : mask(plainKey); });
  copy.addEventListener("click", () => plainKey && TM.copy(plainKey));
  $("#curl-copy").addEventListener("click", () => TM.copy($("#curl-example").textContent));
  $("#curl-toggle").addEventListener("click", () => {
    const pre = $("#curl-example"), open = pre.hidden;
    pre.hidden = !open;
    $("#curl-toggle").setAttribute("aria-expanded", String(open));
    $("#curl-toggle").textContent = (open ? "▾ Hide" : "▸ Show") + " curl example";
  });

  /* ---------- playground ---------- */
  const EX = {
    valid:   { method: "POST", url: "/api/v1/ask", key: true, q: "What is Hampi known for?", desc: "A normal question with your API key. Expect 201 and an answer." },
    nokey:   { method: "POST", url: "/api/v1/ask", key: false, q: "What is Hampi known for?", desc: "Same request without the X-API-Key header. Expect 401." },
    invalid: { method: "POST", url: "/api/v1/ask", key: true, q: "hi", desc: "A 2-character question breaks the 3–500 rule. Expect 422 with a field error." },
    history: { method: "GET", url: "/api/v1/history?limit=3", key: true, desc: "Your 3 most recent saved conversations." },
    health:  { method: "GET", url: "/api/v1/health", key: false, desc: "Public status check: database and model state." },
  };
  const results = {};                                 // last response per example (Back re-shows it)
  let current = "valid";

  function load(name) {
    current = name;
    const ex = EX[name];
    TM.$$("#pg-examples button").forEach((b) => b.classList.toggle("on", b.dataset.ex === name));
    $("#pg-method").textContent = ex.method;
    $("#pg-method").className = "method " + ex.method.toLowerCase();
    $("#pg-url").textContent = ex.url;
    const dl = $("#pg-headers"); dl.textContent = "";
    const head = { Accept: "application/json" };
    if (ex.q != null) head["Content-Type"] = "application/json";
    head["X-API-Key"] = ex.key ? (plainKey ? plainKey.slice(0, 8) + "…" : "regenerate a key first") : "(not sent)";
    Object.entries(head).forEach(([k, v]) => { dl.append(TM.el("dt", null, k), TM.el("dd", null, v)); });
    $("#pg-question-field").hidden = ex.q == null;
    $("#pg-question").value = ex.q || "";
    $("#pg-desc").textContent = ex.desc;
    if (results[name]) showResult(results[name]); else clearResult();
  }
  TM.$$("#pg-examples button").forEach((b) => b.addEventListener("click", () => load(b.dataset.ex)));

  function clearResult() {
    const s = $("#pg-summary"); s.className = "pg-summary empty-state"; s.textContent = "Press “Send request” to call the real API.";
    $("#pg-code").hidden = true;
  }
  function row(dl, k, v) { dl.append(TM.el("dt", null, k), TM.el("dd", null, v)); }

  /** Human summary of a response (status + key facts), never raw JSON. */
  function showResult(res) {
    const s = $("#pg-summary"); s.textContent = "";
    s.className = "pg-summary " + (res.ok ? "ok" : res.status >= 500 ? "bad" : "warn");
    const top = TM.el("div", "pg-status");
    top.append(TM.el("span", "badge " + (res.ok ? "badge-success" : res.status >= 500 ? "badge-error" : "badge-warn"), `HTTP ${res.status}`),
               TM.el("span", "muted small", `${res.ms} ms`));
    s.append(top);
    const dl = TM.el("dl", "kv-list"), d = res.data || {};
    if (d.error) {
      row(dl, "Error code", d.error.code); row(dl, "Message", d.error.message);
      (d.error.details || []).forEach((x) => row(dl, `Field “${x.field}”`, x.message));
    } else if (d.data && !Array.isArray(d.data)) {
      const c = d.data;
      row(dl, "Status", c.status === "answered" ? "Answered" : c.status === "not_found" ? "Not in documents" : c.status);
      row(dl, "Answer", c.answer.replace(/\[(\d)\]\*?/g, "[$1]"));
      row(dl, "Sources", c.sources.map((x) => `${x.title} (${x.score.toFixed(2)})`).join(" · ") || "none");
      row(dl, "Saved as", `conversation #${c.id} · ${(c.latency_ms / 1000).toFixed(2)} s`);
    } else if (Array.isArray(d.data)) {
      row(dl, "Total saved", String(d.total));
      d.data.forEach((c, i) => row(dl, `#${i + 1}`, `${c.question} → ${c.status.replace("_", " ")}`));
    } else if (d.status) {
      row(dl, "Service", d.status); row(dl, "Database", d.database);
      row(dl, "LLM provider", d.ai.provider); row(dl, "Models loaded", `index ${d.ai.index_loaded ? "yes" : "no"} · LLM ${d.ai.llm_loaded ? "yes" : "no"}`);
    }
    s.append(dl);
    const pre = $("#pg-response"); pre.textContent = "";
    pre.append(TM.jsonNodes(res.data));
    $("#pg-code").hidden = false;
    setOpen(false);                                   // collapsed by default
  }
  function setOpen(open) {
    $("#pg-response").hidden = !open;
    $("#pg-toggle").setAttribute("aria-expanded", String(open));
    $("#pg-toggle").textContent = (open ? "▾ Hide" : "▸ Show") + " JSON response";
  }
  $("#pg-toggle").addEventListener("click", () => setOpen($("#pg-response").hidden));
  $("#pg-copy").addEventListener("click", () => results[current] && TM.copy(JSON.stringify(results[current].data, null, 2)));

  async function send() {
    const ex = EX[current], name = current, btn = $("#pg-send");
    if (ex.key && !plainKey) { TM.toast("No key on this page yet", "Press “Regenerate key” first: keys are stored hashed and shown once.", "warn"); return; }
    btn.disabled = true;
    const s = $("#pg-summary"); s.className = "pg-summary empty-state"; s.textContent = name === "valid" ? "Waiting for the RAG pipeline (CPU model, ~20 s)…" : "Sending…";
    $("#pg-code").hidden = true;
    const headers = { Accept: "application/json" };
    if (ex.key) headers["X-API-Key"] = plainKey;
    // credentials "omit": no session cookie, proving the API authenticates with the key alone
    const res = await TM.api(ex.url, { method: ex.method, headers, csrf: false, credentials: "omit", quiet429: false,
                                       body: ex.q != null ? { question: $("#pg-question").value } : undefined });
    results[name] = res;
    if (current === name) showResult(res);
    btn.disabled = false;
    return res;
  }
  $("#pg-send").addEventListener("click", send);
  async function run(name) { load(name); TM.focusEl($("#playground")); await P.wait(TM.speed().stagger * 2); return send(); }
  load("valid");
  TM.apiPage = { regenerate, run, hasKey: () => !!plainKey };

  // Page demo: each Next performs one real request
  const step = (name, title) => ({ title, run: () => run(name), focus: () => { load(name); TM.focusEl($("#playground")); } });
  P.setPageSeq({ title: "API demo", steps: [
    { title: "Regenerate key", run: async () => { TM.focusEl($("#key-card")); await regenerate(); }, focus: () => TM.focusEl($("#key-card")) },
    step("valid", "Valid request"), step("nokey", "Missing key"), step("invalid", "Invalid body"), step("history", "History"), step("health", "Health"),
  ] });
})();
