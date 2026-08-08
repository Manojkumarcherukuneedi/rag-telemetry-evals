import sys
import glob
import os
import re

import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder, SentenceTransformer

from llm import complete
from telemetry import log_trace

MODEL_NAME = "all-MiniLM-L6-v2"
RERANKER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
FUSION_POOL = 10
TOP_K = 4

CITATION_RE = re.compile(r"\[(\d+)\]")

SYSTEM_PROMPT = (
    "Answer the user's question using ONLY the numbered passages given below. "
    "Cite every claim with the passage number(s) it is drawn from, using bracket "
    "markers like [1] or [2][3] right after the claim. If the passages do not "
    "contain enough information to answer the question, reply with EXACTLY this "
    "sentence and nothing else: Not answerable from the provided context."
)


def chunk_text(text, size=120, overlap=30):
    words = text.split()
    chunks = []
    start = 0
    step = size - overlap
    while start < len(words):
        chunk = " ".join(words[start:start + size])
        if chunk:
            chunks.append(chunk)
        if start + size >= len(words):
            break
        start += step
    return chunks


def load_corpus(folder="data"):
    corpus = []
    for path in sorted(glob.glob(os.path.join(folder, "*.md"))):
        filename = os.path.basename(path)
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        for i, chunk in enumerate(chunk_text(text)):
            corpus.append({"chunk_id": f"{filename}::{i}", "text": chunk})
    return corpus


def embed(model, texts):
    return model.encode(texts, normalize_embeddings=True)


def build_bm25(corpus):
    tokenized = [c["text"].lower().split() for c in corpus]
    return BM25Okapi(tokenized)


def rrf_fuse(dense_scores, bm25_scores, k=60, top_k=4):
    n = len(dense_scores)
    dense_order = np.argsort(-dense_scores)
    bm25_order = np.argsort(-bm25_scores)

    dense_rank = np.empty(n, dtype=int)
    bm25_rank = np.empty(n, dtype=int)
    for rank, idx in enumerate(dense_order, start=1):
        dense_rank[idx] = rank
    for rank, idx in enumerate(bm25_order, start=1):
        bm25_rank[idx] = rank

    rrf_scores = 1.0 / (k + dense_rank) + 1.0 / (k + bm25_rank)
    top_idx = np.argsort(-rrf_scores)[:top_k]
    return [(i, dense_scores[i], bm25_scores[i], rrf_scores[i]) for i in top_idx]


def rerank(cross_encoder, query, corpus, fused):
    pairs = [(query, corpus[idx]["text"]) for idx, _, _, _ in fused]
    rerank_scores = cross_encoder.predict(pairs)

    pool = [
        {
            "idx": idx,
            "dense_score": dense_score,
            "bm25_score": bm25_score,
            "rrf_score": rrf_score,
            "fusion_rank": fusion_rank,
            "rerank_score": rerank_score,
        }
        for fusion_rank, ((idx, dense_score, bm25_score, rrf_score), rerank_score)
        in enumerate(zip(fused, rerank_scores), start=1)
    ]
    pool.sort(key=lambda item: -item["rerank_score"])
    return pool


def build_prompt(query, passages):
    listed = "\n\n".join(f"[{n}] {p['text']}" for n, p in enumerate(passages, start=1))
    return (
        f"Passages:\n{listed}\n\n"
        f"Question: {query}\n\n"
        "Answer the question using only the passages above, citing sources with [n] markers."
    )


def parse_citations(answer):
    return {int(n) for n in CITATION_RE.findall(answer)}


def retrieve(query):
    corpus = load_corpus()
    model = SentenceTransformer(MODEL_NAME)
    cross_encoder = CrossEncoder(RERANKER_MODEL)

    corpus_vecs = embed(model, [c["text"] for c in corpus])
    query_vec = embed(model, [query])[0]
    dense_scores = corpus_vecs @ query_vec

    bm25 = build_bm25(corpus)
    bm25_scores = bm25.get_scores(query.lower().split())

    fused = rrf_fuse(dense_scores, bm25_scores, k=60, top_k=FUSION_POOL)
    top = rerank(cross_encoder, query, corpus, fused)[:TOP_K]
    return [
        {**item, "chunk_id": corpus[item["idx"]]["chunk_id"], "text": corpus[item["idx"]]["text"]}
        for item in top
    ]


def answer_query(query):
    passages = retrieve(query)

    prompt = build_prompt(query, passages)
    answer = complete(prompt, system=SYSTEM_PROMPT)
    cited = parse_citations(answer)

    print(f'Query: "{query}"\n')
    print(f"Answer:\n{answer}\n")

    trace_results = []
    for rank, p in enumerate(passages, start=1):
        used = rank in cited
        print(f"[{rank}] {p['chunk_id']}  used={used}")
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

    log_trace(query, trace_results, answer=answer)
    return {"answer": answer, "passages": trace_results}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('Usage: python rag.py "some query"')
        sys.exit(1)
    answer_query(sys.argv[1])
