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
