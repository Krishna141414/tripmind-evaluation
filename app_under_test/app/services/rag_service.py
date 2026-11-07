"""The single entry point between the web layer and the AI code.

Routes call `rag_service.ask(question)` and get a plain dict back. All model code (embeddings, FAISS,
Qwen2.5-0.5B) lives in rag_pipeline.py. If the local LLM fails or times out, the answer falls back to the
extractive provider (best matching sentences + citations) and is flagged `fallback=True`.
"""
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

os.environ.setdefault("HF_HUB_OFFLINE", "1")             # reuse the cached models only, never download
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

from ..errors import AIServiceError          # noqa: E402
from ..logging_setup import event            # noqa: E402
from . import rag_pipeline as rp             # noqa: E402

STOPWORDS = set("the a an and or of in on at to for is are was were be what which who whom how why when where "
                "does do did can could should would i you me my it its this that with from by as about famous "
                "known best visit place".split())


class RagService:
    def __init__(self):
        self.provider = "local"
        self.timeout = 60.0
        self._llm_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="llm")   # one generation at a time
        self._lock = threading.Lock()
        self.models_ready = {"index": False, "llm": False}

    def init_app(self, app):
        self.provider = app.config["LLM_PROVIDER"] if app.config["LLM_PROVIDER"] in ("local", "extractive") else "local"
        self.timeout = app.config["LLM_TIMEOUT"]
        self.warmup_enabled = app.config["WARMUP_MODELS"]

    def start_warmup(self):
        """Called by run.py (not by CLI commands) to load models in the background."""
        if self.warmup_enabled:
            threading.Thread(target=self.warmup, daemon=True, name="warmup").start()

    def warmup(self):
        """Load index + embedder (and the LLM if used) in the background so the first question is fast."""
        try:
            self._load_index()
            if self.provider == "local":
                rp.llm()
                self.models_ready["llm"] = True
            event("info", "models warmed up", event="warmup", provider=self.provider)
        except Exception:
            event("error", "model warm-up failed", event="warmup_failed", exc_info=True)

    def _load_index(self):
        with self._lock:
            rp.load_index()
            rp.embedder()
        self.models_ready["index"] = True

    def health(self):
        return {"provider": self.provider, "index_loaded": self.models_ready["index"],
                "llm_loaded": self.models_ready["llm"], "llm_timeout_s": self.timeout}

    # ---------- main entry point ----------
    def ask(self, question, simulate_llm_failure=False):
        """Returns {answer, status, sources, provider, fallback, fallback_reason, timings}."""
        t0 = time.perf_counter()
        try:
            self._load_index()
            sources, _ = rp.retrieve(question)
        except Exception as e:
            event("error", "retrieval failed", event="ai_service_error", exc_info=True)
            raise AIServiceError() from e
        t1 = time.perf_counter()
        best = sources[0]["score"] if sources else 0.0
        result = {"provider": self.provider, "fallback": False, "fallback_reason": None, "best_score": best}

        if best < rp.THRESHOLD:                                   # unanswerable: no LLM call at all
            result.update(answer=rp.NOT_FOUND, status="not_found", provider="retrieval")
        elif self.provider == "extractive":
            result.update(self._extractive(question, sources))
        else:
            try:
                result.update(self._local_llm(question, sources, simulate_llm_failure))
            except Exception as e:                                # LLM failed / timed out -> fallback
                reason = "timeout" if isinstance(e, FutureTimeout) else type(e).__name__
                event("warning", f"local LLM failed ({reason}); using extractive fallback",
                      event="llm_fallback", reason=reason, exc_info=not isinstance(e, FutureTimeout))
                result.update(self._extractive(question, sources), fallback=True, fallback_reason=reason)
        t2 = time.perf_counter()
        result["sources"] = [{"n": n, "title": s["title"], "url": s["url"], "chunk_id": s["chunk_id"],
                              "text": s["text"], "score": s["score"]} for n, s in enumerate(sources, 1)]
        result["timings"] = {"retrieve_ms": round((t1 - t0) * 1000), "generate_ms": round((t2 - t1) * 1000)}
        return result

    # ---------- providers ----------
    def _local_llm(self, question, sources, simulate_failure):
        def run():
            if simulate_failure:
                raise RuntimeError("simulated LLM failure (demo switch)")
            return rp.generate(rp.build_prompt(question, sources))
        raw = self._llm_pool.submit(run).result(timeout=self.timeout)
        self.models_ready["llm"] = True
        if not raw.strip():
            raise RuntimeError("empty LLM output")
        if "don't know" in raw.lower():
            return {"answer": raw, "status": "not_found", "provider": "local"}
        text, _ = rp.add_citations(raw, sources)
        return {"answer": text, "status": "answered", "provider": "local"}

    @staticmethod
    def _extractive(question, sources, max_sentences=2):
        """No LLM: pick the sentences sharing the most keywords with the question, cite their chunk."""
        q_words = {w for w in re.findall(r"[a-z0-9]{3,}", question.lower()) if w not in STOPWORDS}
        scored = []
        for n, s in enumerate(sources, 1):
            for pos, sent in enumerate(re.split(r"(?<=[.!?])\s+", s["text"])):
                words = set(re.findall(r"[a-z0-9]{3,}", sent.lower()))
                if len(sent) < 25:
                    continue
                # keyword overlap, plus a small bonus for higher-ranked chunks and earlier sentences
                score = len(q_words & words) + s["score"] - 0.01 * pos
                scored.append((score, n, sent.strip()))
        if not scored:
            return {"answer": rp.NOT_FOUND, "status": "not_found", "provider": "extractive"}
        top = sorted(scored, key=lambda x: -x[0])[:max_sentences]
        text = " ".join(f"{sent.rstrip('.')} [{n}]." for _, n, sent in top)
        return {"answer": text, "status": "answered", "provider": "extractive"}


rag_service = RagService()
