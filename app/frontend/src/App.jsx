import { useState } from "react";
import RagInspector from "./RagInspector.jsx";

const API_BASE = "http://localhost:8000";

export default function App() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  async function onRun(question) {
    const q = (question || "").trim();
    if (!q || running) return;

    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok) {
        let detail = "";
        try {
          detail = JSON.stringify(await res.json());
        } catch {
          detail = "";
        }
        throw new Error(
          `API returned ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`
        );
      }

      const data = await res.json();
      setResult(data);
    } catch (e) {
      // fetch throws a TypeError when it can't reach the server at all
      // (connection refused, DNS, or a blocked CORS preflight).
      const isNetwork = e instanceof TypeError;
      setError(
        isNetwork
          ? `Could not reach the API at ${API_BASE} — is the backend running?`
          : e.message || String(e)
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      {error && (
        <div
          role="alert"
          style={{
            fontFamily:
              "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 13.5,
            color: "oklch(0.92 0.05 25)",
            background: "oklch(0.26 0.09 25)",
            borderBottom: "1px solid oklch(0.45 0.14 25)",
            padding: "13px 24px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}
      <RagInspector result={result} onRun={onRun} running={running} />
    </>
  );
}
