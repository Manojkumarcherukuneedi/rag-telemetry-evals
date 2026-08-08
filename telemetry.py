import json
import os
import time
import uuid


def log_trace(query, results, path="traces.jsonl", answer=None):
    trace = {
        "trace_id": str(uuid.uuid4()),
        "timestamp": time.time(),
        "query": query,
        "results": results,
    }
    if answer is not None:
        trace["answer"] = answer
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(trace) + "\n")
    return trace


def load_traces(path="traces.jsonl"):
    if not os.path.exists(path):
        return []
    traces = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                traces.append(json.loads(line))
    return traces


def summarize(path="traces.jsonl"):
    if not os.path.exists(path):
        print(f"No traces found at {path}.")
        return

    traces = load_traces(path)
    if not traces:
        print(f"{path} exists but contains no traces.")
        return

    top1_scores = [t["results"][0]["score"] for t in traces if t["results"]]
    avg_top1 = sum(top1_scores) / len(top1_scores) if top1_scores else 0.0

    print(f"Total traces logged: {len(traces)}")
    print(f"Average top-1 score: {avg_top1:.4f}")


if __name__ == "__main__":
    summarize()
