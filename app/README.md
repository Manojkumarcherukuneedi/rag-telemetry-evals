# RAG API (FastAPI backend)

A thin FastAPI wrapper around the retrieval + generation pipeline in `rag.py`.
The index and models are built **once at server startup** (a ~10s load) and
reused by every request, so queries don't pay the model-load cost.

## Running

From the **repo root**, with the venv active and `ANTHROPIC_API_KEY` set
(generation needs it):

```bash
venv\Scripts\activate            # Windows
source venv/bin/activate         # macOS/Linux
```

```bash
set ANTHROPIC_API_KEY=...         # Windows (use `export ANTHROPIC_API_KEY=...` on mac/linux)
```

```bash
uvicorn app.api:app --reload --port 8000
```

The server is ready once startup finishes loading the models (watch the log
for the model download/load lines to complete).

## Endpoints

### `GET /health`

Liveness check — does not touch the model.

```bash
curl http://localhost:8000/health
```

Response:

```json
{"status": "ok"}
```

### `POST /query`

Runs the full retrieve + generate pipeline.

```bash
curl -X POST http://localhost:8000/query -H "Content-Type: application/json" -d "{\"question\": \"why does chunk overlap matter\"}"
```

Response shape:

```json
{
  "query": "why does chunk overlap matter",
  "answer": "... [1] ...",
  "refused": false,
  "n_retrieved": 4,
  "n_used": 2,
  "chunk_utilization": 0.5,
  "passages": [
    {
      "rank": 1,
      "chunk_id": "chunking.md::2",
      "dense_score": 0.65,
      "bm25_score": 2.29,
      "rerank_score": 4.34,
      "used": true,
      "text": "<full chunk text>"
    }
  ],
  "latency_ms": 812.34
}
```

An out-of-corpus question (e.g. `"what is the capital of France"`) returns
`"answer": "Not answerable from the provided context."` with `"refused": true`.

`POST /query` is rate-limited to 10 requests per minute per client IP; exceeding
that returns HTTP 429 with a JSON `detail` message. This protects API spend once
the service is public.

## Configuration

Environment variables (see `app/.env.example` and `app/frontend/.env.example`):

- **`ANTHROPIC_API_KEY`** (backend) — required for generation (`/query`).
  Retrieval runs without it.
- **`ALLOWED_ORIGINS`** (backend) — comma-separated CORS origins. Add the
  deployed frontend's URL here in production. Defaults to
  `http://localhost:3000` and `http://localhost:5173` when unset.
- **`VITE_API_BASE`** (frontend) — base URL of the backend the UI calls.
  Defaults to `http://localhost:8000` for local dev; point it at the deployed
  backend in production.

## Notes

- Retrieval and telemetry logging (`traces.jsonl`) work exactly as in the CLI;
  every `/query` appends a trace.
- Only generation (`/query`) needs `ANTHROPIC_API_KEY`. `/health` does not.
- CORS origins default to `http://localhost:3000` and `http://localhost:5173`
  so the React frontend can call this cross-origin, and are overridable via
  `ALLOWED_ORIGINS`.
