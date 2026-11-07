/* Admin logs: tidy table (time, level, event, message) built from the structured log lines.
   No raw JSON: a row expands into labelled request details. Auto-refresh is off until you turn it on. */
"use strict";
(function () {
  const P = TM.player, $ = TM.$;
  const body = $("#logs-body"), count = $("#log-count");
  const SECURITY = ["prompt_injection_blocked", "rate_limited", "csrf_blocked", "login_failed", "auth_failed", "forbidden", "llm_fallback", "exception"];
  const LABEL = { request: "Request", ask: "Question answered", prompt_injection_blocked: "Injection blocked", rate_limited: "Rate limited",
                  csrf_blocked: "CSRF blocked", login_failed: "Login failed", login: "Login", logout: "Logout", auth_failed: "Bad API key",
                  forbidden: "Forbidden", llm_fallback: "LLM fallback", exception: "Server error", validation_error: "Validation error",
                  api_key_regenerated: "API key regenerated", register: "Registered", startup: "App started", warmup: "Models loaded", seed: "Database seeded" };
  let level = "", timer = null;

  const time = (ts) => (ts || "").replace("T", " ").slice(5, 19);
  function message(r) {
    if (r.event === "request") return `${r.method} ${r.route} → ${r.status} in ${r.latency_ms} ms`;
    return r.msg;
  }
  function details(r) {
    const dl = TM.el("dl", "kv-list cols");
    const add = (k, v) => { if (v != null && v !== "") dl.append(TM.el("dt", null, k), TM.el("dd", null, String(v))); };
    add("Request ID", r.request_id); add("User", r.user); add("Route", r.route && `${r.method} ${r.route}`); add("Status", r.status);
    add("Latency", r.latency_ms != null ? r.latency_ms + " ms" : null); add("IP", r.ip); add("Provider", r.provider);
    add("Conversation", r.conversation_id && "#" + r.conversation_id); add("Matched text", r.match); add("Reason", r.reason); add("Limit", r.limit);
    if (r.details) add("Field errors", r.details.map((d) => `${d.field}: ${d.message}`).join("; "));
    if (r.stack) add("Stack trace", "Recorded in logs/app.log (not shown in the browser)");
    return dl;
  }
  function row(r) {
    const tr = TM.el("tr", "lvl-" + r.level);
    if (SECURITY.includes(r.event)) tr.classList.add("sec");
    const lv = TM.el("td"); lv.append(TM.el("span", "lvl " + r.level, r.level));
    const ev = TM.el("td"); ev.append(TM.el("span", "event-tag", LABEL[r.event] || (r.event || "log").replace(/_/g, " ")));
    const msg = TM.el("td", "msg-cell");
    msg.append(TM.el("span", null, message(r)), TM.el("small", "muted", `${r.user || "system"}${r.request_id ? " · req " + r.request_id : ""}`));
    tr.append(TM.el("td", "mono nowrap", time(r.ts)), lv, ev, msg);
    tr.tabIndex = 0;
    const toggle = () => {
      const next = tr.nextElementSibling;
      if (next && next.classList.contains("expand")) { next.remove(); return; }
      const ex = TM.el("tr", "expand"), td = TM.el("td"); td.colSpan = 4; td.append(details(r)); ex.append(td); tr.after(ex);
    };
    tr.addEventListener("click", toggle);
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter") toggle(); });
    return tr;
  }

  async function load() {
    const res = await TM.api(`/admin/logs/data?limit=150&level=${encodeURIComponent(level)}`);
    if (!res.ok) return;
    let rows = res.data.data;
    if ($("#log-security").checked) rows = rows.filter((r) => SECURITY.includes(r.event) || r.level === "ERROR");
    body.textContent = "";
    if (!rows.length) { const tr = TM.el("tr"), td = TM.el("td", "muted", "No log entries match this filter."); td.colSpan = 4; tr.append(td); body.append(tr); }
    rows.forEach((r) => body.append(row(r)));
    count.textContent = rows.length + " entries";
  }
  function schedule() { clearInterval(timer); if ($("#log-live").checked) timer = setInterval(load, 3000); }
  function setLevel(l) { level = l; TM.$$("#log-level button").forEach((x) => x.classList.toggle("on", x.dataset.level === l)); return load(); }

  TM.$$("#log-level button").forEach((b) => b.addEventListener("click", () => setLevel(b.dataset.level)));
  $("#log-security").addEventListener("change", load);
  $("#log-live").addEventListener("change", schedule);
  $("#log-refresh").addEventListener("click", load);
  load();
  const setSecurity = (on) => { $("#log-security").checked = on; return load(); };
  TM.logsPage = { load, setSecurity };

  P.setPageSeq({ title: "Logs demo", steps: [
    { title: "Warnings only", run: () => { TM.focusEl($("#logs-card")); return setLevel("WARNING"); }, undo: () => setLevel("") },
    { title: "Errors only", run: () => setLevel("ERROR"), undo: () => setLevel("WARNING") },
    { title: "Security events", run: async () => { await setLevel(""); await setSecurity(true); }, undo: async () => { await setSecurity(false); await setLevel("ERROR"); } },
  ] });
})();
