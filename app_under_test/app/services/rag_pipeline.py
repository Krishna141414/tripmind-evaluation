"""RAG Travel Guide pipeline, copied unchanged from my Task 8 repo (Krishna141414/rag-travel-guide, rag.py)
except for the paths below. Only app/services/rag_service.py imports this module.

RAG Travel Guide: ingest -> clean -> chunk -> embed -> FAISS -> retrieve -> prompt -> local LLM answer with sources."""
import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]       # project root (was the repo root in Task 8)
DATA = ROOT / "data" / "articles.json"          # 25 Wikipedia travel articles (reused from Task 7)
INDEX_DIR = ROOT / "index"
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
LLM_MODEL = "Qwen/Qwen2.5-0.5B-Instruct"        # small instruct model, already in the local HF cache

CHUNK_SIZE, OVERLAP = 500, 100                   # characters
TOP_K = 3
THRESHOLD = 0.50                                 # best cosine score below this -> "not in documents", no LLM call
MAX_NEW_TOKENS = 160
NOT_FOUND = "I couldn't find this in the travel guide documents."

SYSTEM = ("You are a travel guide assistant. Answer the question using ONLY the numbered context passages. "
          "Cite the passages you used like [1] or [2] right after the facts they support. "
          "Write 1-3 full sentences, and every sentence must end with its citation. "
          "Example: \"Kochi is a port city in Kerala [1]. It is known for its Chinese fishing nets [2].\" "
          "If the context does not contain the answer, reply exactly: "
          "\"I don't know based on the travel guide documents.\"")


# ---------- 1. Ingestion + cleaning ----------
def load_raw(path=DATA):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def is_heading(line):
    """Task 7 turned '== History ==' headings into short lines like 'History.'"""
    return len(line) < 45 and line.endswith(".") and line.count(".") == 1 and len(line.split()) <= 6


def clean_text(text):
    """Remove pronunciation/IPA brackets, citation marks, empty parentheses, empty sections and extra whitespace."""
    text = re.sub(r"\s*\([^()]*\[[^\]]*\][^()]*\)", "", text)       # "(Konkani: [ɡɔ̃j]; ...)" pronunciation groups
    text = re.sub(r"\[[^\]]{0,40}\]", "", text)                     # leftover [1], [citation needed], [IPA]
    text = re.sub(r"\(\s*[;,]?\s*\)", "", text)                     # empty "()" left behind
    text = re.sub(r"[ \t ]+", " ", text)                       # collapse spaces
    text = re.sub(r" ([,.;:])", r"\1", text)
    lines = [l.strip() for l in text.split("\n") if len(l.strip()) > 2]
    # drop headings with no body (next line is another heading, or end of article) and photo galleries
    keep = [l for i, l in enumerate(lines)
            if not (is_heading(l) and (i + 1 == len(lines) or is_heading(lines[i + 1]) or l == "Gallery."))]
    return "\n".join(keep).strip()


def load_articles():
    return [{**a, "text": clean_text(a["text"])} for a in load_raw()]


# ---------- 2. Chunking (adapted from Task 7) ----------
def chunk_text(text, size=CHUNK_SIZE, overlap=OVERLAP):
    """~size-char windows that overlap by `overlap` chars; boundaries snap to spaces so words are never cut."""
    spans, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            space = text.rfind(" ", start + size // 2, end)
            end = space if space > 0 else end
        spans.append((start, end))
        if end == len(text):
            break
        start = max(end - overlap, start + 1)
        nxt = text.find(" ", start)                                  # start the overlap on a word boundary
        start = nxt + 1 if 0 < nxt < end else start
    return spans


def make_chunks(articles):
    return [{"title": a["title"], "url": a["url"], "chunk_id": i, "text": a["text"][s:e].strip()}
            for a in articles for i, (s, e) in enumerate(chunk_text(a["text"]))]


# ---------- 3. Embeddings + vector store ----------
_cache = {}


def embedder():
    if "emb" not in _cache:
        from sentence_transformers import SentenceTransformer
        _cache["emb"] = SentenceTransformer(EMBED_MODEL, device="cpu")
    return _cache["emb"]


def embed(texts):
    """384-d L2-normalised vectors, so inner product = cosine similarity."""
    return embedder().encode(texts, batch_size=64, normalize_embeddings=True, convert_to_numpy=True).astype("float32")


def load_index():
    """Build the FAISS index once and save it to index/; afterwards just load it."""
    if "index" not in _cache:
        import faiss
        f_idx, f_meta = INDEX_DIR / "chunks.faiss", INDEX_DIR / "chunks.json"
        if f_idx.exists() and f_meta.exists():
            index, chunks = faiss.read_index(str(f_idx)), json.loads(f_meta.read_text(encoding="utf-8"))
        else:
            chunks = make_chunks(load_articles())
            vecs = embed([c["text"] for c in chunks])
            index = faiss.IndexFlatIP(vecs.shape[1])                 # exact cosine search
            index.add(vecs)
            INDEX_DIR.mkdir(exist_ok=True)
            faiss.write_index(index, str(f_idx))
            f_meta.write_text(json.dumps(chunks, ensure_ascii=False), encoding="utf-8")
        _cache["index"] = (index, chunks)
    return _cache["index"]


# ---------- 4. Retrieval ----------
def retrieve(question, k=TOP_K):
    index, chunks = load_index()
    qv = embed([question])
    scores, ids = index.search(qv, k)
    return [{**chunks[i], "score": round(float(s), 4)} for s, i in zip(scores[0], ids[0]) if i >= 0], qv[0]


# ---------- 5. Prompt construction ----------
def build_prompt(question, sources):
    context = "\n\n".join(f"[{n}] ({s['title']}) {s['text']}" for n, s in enumerate(sources, 1))
    user = f"Context:\n{context}\n\nQuestion: {question}\nAnswer (with citations):"
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]


# ---------- 6. Generation ----------
def llm():
    if "llm" not in _cache:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        tok = AutoTokenizer.from_pretrained(LLM_MODEL)
        model = AutoModelForCausalLM.from_pretrained(LLM_MODEL, dtype=torch.float32).eval()
        _cache["llm"] = (tok, model)
    return _cache["llm"]


def generate(messages):
    """Greedy decoding (= temperature 0) with a short token budget."""
    import torch
    tok, model = llm()
    ids = tok.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt", return_dict=True)
    with torch.no_grad():
        out = model.generate(**ids, max_new_tokens=MAX_NEW_TOKENS, do_sample=False, repetition_penalty=1.1,
                             pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True).strip()


def add_citations(text, sources):
    """The 0.5B model often forgets citations. For each uncited sentence, cite the source it shares the most
    words with (marked [n]* so the page can show it was added automatically, not written by the LLM)."""
    words = lambda s: set(re.findall(r"[a-z0-9]{3,}", s.lower()))
    m = re.match(r"^\s*\[(\d)\]\s*(.*)$", text, re.S)               # "[1] Answer." -> "Answer [1]."
    if m:
        text = re.sub(r"([.!?]?)$", rf" [{m[1]}]\1", m[2].strip(), count=1)
    sents, added = re.split(r"(?<=[.!?])\s+", text.strip()), 0
    for i, s in enumerate(sents):
        if s and not re.search(r"\[\d\]", s):
            n = max(range(len(sources)), key=lambda j: len(words(s) & words(sources[j]["text"]))) + 1
            sents[i] = re.sub(r"([.!?]?)$", rf" [{n}]*\1", s, count=1)
            added += 1
    return " ".join(sents), added


# ---------- Full pipeline ----------
def answer(question):
    """Returns answer, status (answered / not_found), sources with scores, the exact prompt and timings."""
    t0 = time.perf_counter()
    sources, qv = retrieve(question)
    t1 = time.perf_counter()
    messages = build_prompt(question, sources)
    best = sources[0]["score"] if sources else 0.0
    if best < THRESHOLD:                                             # unanswerable: skip the LLM entirely
        text, status, llm_called, raw, auto = NOT_FOUND, "not_found", False, "", 0
    else:
        raw, llm_called = generate(messages), True
        status = "not_found" if "don't know" in raw.lower() else "answered"
        text, auto = add_citations(raw, sources) if status == "answered" else (raw, 0)
    t2 = time.perf_counter()
    return {"question": question, "answer": text, "raw_answer": raw, "auto_citations": auto,
            "status": status, "llm_called": llm_called,
            "best_score": best, "threshold": THRESHOLD, "sources": sources, "messages": messages,
            "query_vec": [round(float(x), 3) for x in qv[:24]],
            "ms": {"retrieve": round((t1 - t0) * 1000, 1), "generate": round((t2 - t1) * 1000), "total": round((t2 - t0) * 1000)}}


if __name__ == "__main__":
    import sys
    r = answer(" ".join(sys.argv[1:]) or "What is Munnar famous for?")
    print(r["status"], r["best_score"], "\n", r["answer"])
    for n, s in enumerate(r["sources"], 1):
        print(f"[{n}] {s['title']} #{s['chunk_id']} {s['score']}")
