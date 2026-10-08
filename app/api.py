import os
import sys
import time
import threading
from collections import defaultdict, deque
from contextlib import asynccontextmanager

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sentence_transformers import CrossEncoder, SentenceTransformer

import rag
from llm import complete
from telemetry import log_trace

REFUSAL_TEXT = "Not answerable from the provided context."

DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
]

# Allowed CORS origins come from ALLOWED_ORIGINS (comma-separated) so a deployed
# frontend's domain can be added without a code change; falls back to the local
# dev origins when the env var is unset or empty.
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()
] or DEFAULT_ORIGINS

# Simple in-memory per-IP rate limit on POST /query: at most RATE_LIMIT_MAX
# requests per RATE_LIMIT_WINDOW seconds per client IP. Dependency-light (no
# Redis); resets on restart, which is fine for protecting API spend on a single
# instance.
RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW = 60.0
_rate_hits = defaultdict(deque)
_rate_lock = threading.Lock()


def rate_limit_exceeded(client_ip):
    now = time.monotonic()
    with _rate_lock:
        hits = _rate_hits[client_ip]
        while hits and hits[0] <= now - RATE_LIMIT_WINDOW:
            hits.popleft()
        if len(hits) >= RATE_LIMIT_MAX:
            return True
        hits.append(now)
        return False

# Built once at server startup and reused by every request. The heavy model
# loads (~10s) happen at boot, not on the first query.
STATE = {}

# The sentence-transformer / cross-encoder objects are shared across requests;
# serialize pipeline runs so concurrent requests don't call predict() on the
# same model at once.
PIPELINE_LOCK = threading.Lock()


def build_index():
    corpus = rag.load_corpus()
    model = SentenceTransformer(rag.MODEL_NAME)
    cross_encoder = CrossEncoder(rag.RERANKER_MODEL)
    corpus_vecs = rag.embed(model, [c["text"] for c in corpus])
    bm25 = rag.build_bm25(corpus)
    return {
        "corpus": corpus,
        "model": model,
        "cross_encoder": cross_encoder,
        "corpus_vecs": corpus_vecs,
        "bm25": bm25,
    }


@asynccontextmanager
async def lifespan(app):
    STATE.update(build_index())
    yield
    STATE.clear()


app = FastAPI(title="RAG with Telemetry and Evals", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    question: str


def normalize(text):
    return " ".join(text.strip().lower().split())


def run_pipeline(question):
    """Same retrieve+generate flow as rag.answer_query, but using the models and
    index built once at startup instead of rebuilding them per call."""
    corpus = STATE["corpus"]
    model = STATE["model"]
    cross_encoder = STATE["cross_encoder"]
    corpus_vecs = STATE["corpus_vecs"]
    bm25 = STATE["bm25"]

    query_vec = rag.embed(model, [question])[0]
    dense_scores = corpus_vecs @ query_vec
    bm25_scores = bm25.get_scores(question.lower().split())

    fused = rag.rrf_fuse(dense_scores, bm25_scores, k=60, top_k=rag.FUSION_POOL)
    top = rag.rerank(cross_encoder, question, corpus, fused)[:rag.TOP_K]
    passages = [
        {**item, "chunk_id": corpus[item["idx"]]["chunk_id"], "text": corpus[item["idx"]]["text"]}
        for item in top
    ]

    prompt = rag.build_prompt(question, passages)
    answer = complete(prompt, system=rag.SYSTEM_PROMPT)
    cited = rag.parse_citations(answer)
    return passages, answer, cited


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/query")
def query(req: QueryRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if rate_limit_exceeded(client_ip):
        return JSONResponse(
            status_code=429,
            content={
                "detail": (
                    f"Rate limit exceeded: max {RATE_LIMIT_MAX} requests per "
                    f"{int(RATE_LIMIT_WINDOW)} seconds. Please slow down and retry."
                )
            },
        )

    start = time.perf_counter()
    with PIPELINE_LOCK:
        passages, answer, cited = run_pipeline(req.question)
    latency_ms = (time.perf_counter() - start) * 1000.0

    result_passages = []
    trace_results = []
    for rank, p in enumerate(passages, start=1):
        used = rank in cited
        result_passages.append({
            "rank": rank,
            "chunk_id": p["chunk_id"],
            "dense_score": round(float(p["dense_score"]), 4),
            "bm25_score": round(float(p["bm25_score"]), 4),
            "rerank_score": round(float(p["rerank_score"]), 4),
            "used": used,
            "text": p["text"],
        })
        trace_results.append({
            "rank": rank,
            "chunk_id": p["chunk_id"],
            "dense_score": round(float(p["dense_score"]), 4),
            "bm25_score": round(float(p["bm25_score"]), 4),
            "rrf_score": round(float(p["rrf_score"]), 4),
            "rerank_score": round(float(p["rerank_score"]), 4),
            "fusion_rank": p["fusion_rank"],
            "used": used,
            "preview": p["text"][:160].replace("\n", " "),
        })

    # Keep telemetry parity with rag.answer_query: every query appends a trace.
    log_trace(req.question, trace_results, answer=answer)

    n_retrieved = len(result_passages)
    n_used = sum(1 for p in result_passages if p["used"])
    chunk_utilization = (n_used / n_retrieved) if n_retrieved else 0.0
    refused = normalize(answer) == normalize(REFUSAL_TEXT)

    return {
        "query": req.question,
        "answer": answer,
        "refused": refused,
        "n_retrieved": n_retrieved,
        "n_used": n_used,
        "chunk_utilization": round(chunk_utilization, 4),
        "passages": result_passages,
        "latency_ms": round(latency_ms, 2),
    }
