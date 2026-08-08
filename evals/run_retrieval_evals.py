import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag import retrieve

GOLDEN_PATH = os.path.join(os.path.dirname(__file__), "golden.jsonl")
RESULTS_PATH = os.path.join(os.path.dirname(__file__), "retrieval_results.json")

REFUSAL_DENSE_THRESHOLD = 0.15

STOPWORDS = {
    "the", "and", "that", "with", "for", "from", "are", "this", "into", "than",
    "then", "been", "being", "have", "has", "was", "were", "its", "but", "not",
    "does", "doing", "each", "such", "will", "what", "when", "where", "which",
    "while", "about", "there", "their", "these", "those", "your", "you", "can",
    "used", "use", "one", "two", "also", "more", "most", "some", "other",
    "between", "without", "because", "instead", "same", "even", "very",
    "any", "all", "own", "over", "under", "again", "once", "only", "both",
}

WORD_RE = re.compile(r"[a-zA-Z]+")


def load_golden(path=GOLDEN_PATH):
    cases = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                cases.append(json.loads(line))
    return cases


def normalize(text):
    return " ".join(text.strip().lower().split())


def significant_words(text):
    words = WORD_RE.findall(text.lower())
    return {w for w in words if len(w) > 3 and w not in STOPWORDS}


def pool_text(passages):
    return normalize(" ".join(p["text"] for p in passages))


def score_factual(case, passages):
    expected = normalize(case["answer"])
    text = pool_text(passages)
    passed = expected in text
    reason = "expected string found in top-4 chunks" if passed else f"expected string not retrieved: {case['answer']!r}"
    return {"pass": passed, "reason": reason}


def score_open(case, passages):
    text = pool_text(passages)
    sig = significant_words(case["reference"])
    hits = sorted(w for w in sig if w in text)
    passed = len(hits) >= 3
    reason = f"{len(hits)}/{len(sig)} significant reference words retrieved: {hits[:6]}"
    return {"pass": passed, "reason": reason}


def score_refusal(case, passages):
    top_dense = float(passages[0]["dense_score"]) if passages else 0.0
    passed = top_dense < REFUSAL_DENSE_THRESHOLD
    reason = f"top-1 dense score {top_dense:.4f} (threshold {REFUSAL_DENSE_THRESHOLD})"
    return {"pass": passed, "reason": reason, "top_dense_score": round(top_dense, 4)}


def score_case(case, passages):
    if case["type"] == "factual":
        return score_factual(case, passages)
    if case["type"] == "open":
        return score_open(case, passages)
    if case["type"] == "refusal":
        return score_refusal(case, passages)
    return {"pass": False, "reason": f"unknown case type: {case['type']}"}


def passage_summary(p):
    return {
        "chunk_id": p["chunk_id"],
        "dense_score": round(float(p["dense_score"]), 4),
        "bm25_score": round(float(p["bm25_score"]), 4),
        "rrf_score": round(float(p["rrf_score"]), 4),
        "rerank_score": round(float(p["rerank_score"]), 4),
        "preview": p["text"][:160].replace("\n", " "),
    }


def run():
    cases = load_golden()
    results = []
    counts = {"factual": [0, 0], "open": [0, 0], "refusal": [0, 0]}

    for case in cases:
        passages = retrieve(case["question"])
        outcome = score_case(case, passages)
        passed = outcome["pass"]

        counts[case["type"]][1] += 1
        if passed:
            counts[case["type"]][0] += 1

        status = "PASS" if passed else "FAIL"
        print(f"{case['id']:<4} {case['type']:<8} {status}  reason={outcome['reason']}")

        results.append({
            "id": case["id"],
            "type": case["type"],
            "question": case["question"],
            "passages": [passage_summary(p) for p in passages],
            "pass": passed,
            "reason": outcome["reason"],
        })

    print()
    total_passed = 0
    total_count = 0
    for case_type in ("factual", "open", "refusal"):
        passed, count = counts[case_type]
        total_passed += passed
        total_count += count
        print(f"{case_type} {passed}/{count}")
    print(f"TOTAL {total_passed}/{total_count}")

    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    return total_passed == total_count


if __name__ == "__main__":
    all_passed = run()
    sys.exit(0 if all_passed else 1)
