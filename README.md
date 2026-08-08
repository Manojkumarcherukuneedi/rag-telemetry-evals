# RAG with Telemetry and Evals

A retrieval-augmented generation system built telemetry-first: each retrieval
stage was added because instrumentation proved the previous one had a specific
gap, and it ships with an eval harness that acts as a regression test suite.

## What it does

The system grounds an LLM in a local markdown corpus. It retrieves with a
three-stage pipeline, generates answers with inline `[n]` citations, tracks
which retrieved chunks the answer actually used, refuses when the corpus
doesn't cover the question, and scores itself against a golden eval set.

## Pipeline

Documents are split into overlapping word-window chunks and embedded with
`all-MiniLM-L6-v2` into a dense index; the same chunks are also indexed with
BM25 for exact-term matching. For a query, the two rankings are fused with
Reciprocal Rank Fusion (`k=60`), and the fused candidate pool is reranked by a
cross-encoder (`cross-encoder/ms-marco-MiniLM-L-6-v2`) that reads the query and
each chunk jointly for a more accurate relevance score. The top-k passages
after reranking are handed to the LLM, which generates an answer citing
sources with `[n]` markers. Those citations are parsed back into a per-chunk
"used" flag, and every query — its candidates, scores, and answer — is logged
to `traces.jsonl`.

## Telemetry

Every query logs the full candidate list with its dense, BM25, RRF, and
rerank scores, whether each chunk made it into the final top-k, and whether
the generated answer actually cited it (the "used" flag). "Retrieved but
never used" is the key signal for over-retrieval — chunks that made the cut
but didn't contribute to the answer. `telemetry.py`'s `summarize()` reports
chunk utilization across logged traces.

## Evaluation

`evals/golden.jsonl` holds 14 ground-truth cases across three types:
`factual` (the answer must contain an exact string), `open` (graded by an LLM
judge against a reference description), and `refusal` (the system must return
exactly `"Not answerable from the provided context."`). `evals/run_evals.py`
runs the full retrieve-and-generate pipeline against every case, scores all
three types, and exits non-zero if anything fails.

## Setup and running

This project uses a venv folder literally named `venv` (not `.venv`).

```bash
python -m venv venv
```

```bash
venv\Scripts\activate            # Windows
source venv/bin/activate         # macOS/Linux
```

```bash
pip install -r requirements.txt
```

```bash
set ANTHROPIC_API_KEY=...        # needed only for generation + evals
```

```bash
python rag.py "your question here"
```

```bash
python evals/run_evals.py
```

Retrieval and telemetry run without an API key. Only generation and the LLM
judge need `ANTHROPIC_API_KEY` set.

## Design notes / known limitations

- The demo corpus is small (six short markdown docs), which makes retrieval
  quality easy to inspect by eye but doesn't stress-test the pipeline at
  scale.
- The refusal threshold has thin headroom: some out-of-corpus queries score
  around 0.09 dense similarity against a 0.15 cutoff. This may need retuning
  if the corpus grows and legitimate answers start scoring closer to that
  range.
- `TOP_K` is currently 4, but telemetry shows generated answers often cite
  only 1-2 of the 4 passages — `TOP_K` could likely be reduced without losing
  answer quality.
- CI installs the full GPU-enabled `torch` build via `requirements.txt`, even
  though everything runs CPU-only. Pinning a CPU-only torch wheel would slim
  down install time in the workflow.

## Continuous evaluation

Two GitHub Actions workflows gate this project:

- **[`ci.yml`](.github/workflows/ci.yml)** — runs on every push and pull request.
  It installs dependencies, compile-checks all `.py` files, then runs
  `evals/run_retrieval_evals.py`. This checks retrieval recall (and the
  refusal threshold) deterministically against `evals/golden.jsonl` with no
  LLM calls, so it needs no API key and costs nothing to run on every commit.

- **[`full-eval.yml`](.github/workflows/full-eval.yml)** — runs on a weekly
  schedule and can also be triggered manually (`workflow_dispatch`). It runs
  `evals/run_evals.py`, the full retrieve-and-generate pipeline plus an
  LLM-as-judge pass over the open-ended cases. This calls the Anthropic API,
  so it's the paid gate — run less often, on demand or weekly, rather than on
  every push.

### Adding the API key

`full-eval.yml` needs `ANTHROPIC_API_KEY` available as a GitHub Actions
secret:

1. Go to the repo on GitHub → **Settings** → **Secrets and variables** →
   **Actions**.
2. Click **New repository secret**.
3. Name it `ANTHROPIC_API_KEY` and paste your key as the value.
4. Save. The workflow reads it via `${{ secrets.ANTHROPIC_API_KEY }}` — it is
   never checked into the repo or printed in logs.

`ci.yml` does not need this secret at all.
