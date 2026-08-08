import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from llm import complete
from rag import answer_query

GOLDEN_PATH = os.path.join(os.path.dirname(__file__), "golden.jsonl")
RESULTS_PATH = os.path.join(os.path.dirname(__file__), "results.json")

REFUSAL_TEXT = "not answerable from the provided context."

JUDGE_SYSTEM_PROMPT = (
    "You are grading whether a generated answer conveys the substance of a reference "
    "answer, for a retrieval-augmented QA system. Score generously: PASS means the "
    "generated answer captures the key idea(s) of the reference, even if worded very "
    "differently, shorter, longer, or in a different order — it does not need to be a "
    "close paraphrase. Only FAIL if the generated answer omits the core idea entirely, "
    "is off-topic, or directly contradicts the reference. "
    'Respond with ONLY a JSON object of the form {"score": <float 0-1>, "pass": '
    '<true|false>, "reason": "<one sentence>"} and nothing else — no code fences, '
    "no extra text."
)


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


def score_factual(case, answer):
    normalized_answer = normalize(answer)
    if normalized_answer == REFUSAL_TEXT:
        return {"pass": False, "reason": "system refused instead of answering"}
    expected = normalize(case["answer"])
    passed = expected in normalized_answer
    reason = "contains expected string" if passed else f"missing expected string: {case['answer']!r}"
    return {"pass": passed, "reason": reason}


def score_refusal(case, answer):
    passed = normalize(answer) == REFUSAL_TEXT
    reason = "refused as expected" if passed else f"did not refuse, got: {answer[:120]!r}"
    return {"pass": passed, "reason": reason}


def build_judge_prompt(question, reference, answer):
    return (
        f"Question: {question}\n\n"
        f"Reference (what a correct answer should convey):\n{reference}\n\n"
        f"Generated answer to grade:\n{answer}\n\n"
        "Does the generated answer convey the substance of the reference without "
        "contradicting it? Respond with the JSON object described in your instructions."
    )


def parse_judge_response(raw):
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        data = json.loads(text)
        return {
            "score": float(data.get("score", 0.0)),
            "pass": bool(data.get("pass", False)),
            "reason": str(data.get("reason", "")),
        }
    except (json.JSONDecodeError, TypeError, ValueError):
        return {"score": 0.0, "pass": False, "reason": f"unparseable judge response: {raw!r}"}


def score_open(case, answer):
    prompt = build_judge_prompt(case["question"], case["reference"], answer)
    raw = complete(prompt, system=JUDGE_SYSTEM_PROMPT)
    judged = parse_judge_response(raw)
    return {"pass": judged["pass"], "reason": judged["reason"], "score": judged["score"]}


def score_case(case, answer):
    if case["type"] == "factual":
        return score_factual(case, answer)
    if case["type"] == "refusal":
        return score_refusal(case, answer)
    if case["type"] == "open":
        return score_open(case, answer)
    return {"pass": False, "reason": f"unknown case type: {case['type']}"}


def run():
    cases = load_golden()
    results = []
    counts = {"factual": [0, 0], "open": [0, 0], "refusal": [0, 0]}

    for case in cases:
        pipeline_result = answer_query(case["question"])
        answer = pipeline_result["answer"]
        passages = pipeline_result["passages"]

        outcome = score_case(case, answer)
        passed = outcome["pass"]

        counts[case["type"]][1] += 1
        if passed:
            counts[case["type"]][0] += 1

        status = "PASS" if passed else "FAIL"
        line = f"{case['id']:<4} {case['type']:<8} {status}"
        if case["type"] == "open":
            line += f"  score={outcome.get('score', 0.0):.2f}  reason={outcome['reason']}"
        else:
            line += f"  reason={outcome['reason']}"
        print(line)

        results.append({
            "id": case["id"],
            "type": case["type"],
            "question": case["question"],
            "answer": answer,
            "passages": passages,
            "pass": passed,
            "score": outcome.get("score"),
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
