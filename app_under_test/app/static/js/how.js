/* How it works: the control bar follows one question through the architecture, one hop per step. */
"use strict";
(function () {
  const P = TM.player, $ = TM.$;
  const HOPS = [
    "1 · A browser (session + CSRF token) or an API client (X-API-Key) sends a question.",
    "2 · The security layer checks CSRF, rate limits and login / API key, adds headers and a request id for the logs.",
    "3 · A blueprint handles the route: auth/, main/ (pages), api/ (REST) or admin/ (logs).",
    "4 · ask_flow.py validates with Pydantic, runs the prompt-injection guard and saves the result.",
    "5 · rag_service.py is the only door to the AI code: it times out the LLM and falls back to extractive answers.",
    "6 · rag_pipeline.py (Task 8): MiniLM embeddings → FAISS top-3 → Qwen2.5-0.5B answer with citations.",
    "7 · The conversation is saved to SQLite and every request is written to logs/app.log as a JSON line.",
  ];
  const note = $("#flow-note"), first = note.textContent;
  const light = (k, on) => TM.$$(`[data-flow="${k}"]`).forEach((n) => n.classList.toggle("lit", on));
  const lightAll = () => {
    HOPS.forEach((_, i) => light(i + 1, true));
    note.textContent = "The full path: browser → security layer → blueprint → ask flow → RAG service → pipeline → SQLite + logs.";
  };
  TM.howPage = { lightAll };
  P.setPageSeq({ title: "Architecture walk-through", steps: HOPS.map((text, i) => ({
    title: "Hop " + (i + 1),
    run: async () => { if (i === 0) TM.focusEl($("#arch")); light(i + 1, true); note.textContent = text; await P.wait(TM.speed().stagger); },
    undo: () => { light(i + 1, false); note.textContent = i ? HOPS[i - 1] : first; },
  })) });
})();
