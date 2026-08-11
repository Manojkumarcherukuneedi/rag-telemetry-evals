import React, { useMemo, useState } from "react";

/* ------------------------------------------------------------------ */
/* Sample data — used only as a fallback so the component previews      */
/* standalone. Pass a `result` prop to render real pipeline output.     */
/* ------------------------------------------------------------------ */

const SAMPLE_RESULT = {
  query: "Why does hybrid search beat dense-only retrieval on our support corpus?",
  answer:
    "Hybrid search wins on this corpus because BM25 recovers exact-match signals that the dense encoder collapses. Support tickets are dense with product SKUs, error codes, and version strings, and the embedding model maps most of those tokens to nearly identical vectors [1].\n\nBM25 scores those terms by rarity instead, so a query containing E_4021 retrieves the one chunk that actually names it [2]. The two rankings are then fused with reciprocal rank fusion at k=60, which keeps any document either retriever ranks highly without letting one retriever's score scale dominate [3].\n\nOn the 480-question evaluation set that moved recall@10 from 0.71 to 0.88, with nearly all of the gain concentrated on queries containing at least one rare token.",
  refused: false,
  n_retrieved: 8,
  n_used: 3,
  chunk_utilization: 37.5,
  latency_ms: 1480,
  passages: [
    { rank: 1, chunk_id: "bm25.md::0", dense_score: 0.812, bm25_score: 14.27, rerank_score: 0.941, used: true, text: "Lexical scoring rewards rare terms. A token appearing in 3 of 40,000 chunks carries far more weight than one appearing in 12,000, which is why identifiers, SKUs and error codes behave so differently under BM25 than under a dense encoder." },
    { rank: 2, chunk_id: "hybrid-search.md::3", dense_score: 0.786, bm25_score: 11.03, rerank_score: 0.907, used: true, text: "Reciprocal rank fusion combines ranked lists without score normalization: score(d) = Σ 1 / (k + rank_i(d)), with k = 60. A document ranked first by either retriever is promoted regardless of the raw magnitude of that retriever's scores." },
    { rank: 3, chunk_id: "bm25.md::2", dense_score: 0.741, bm25_score: 9.88, rerank_score: 0.664, used: true, text: "Embedding models trained on natural language place unseen alphanumeric strings near each other in vector space. E_4021 and E_4102 differ by one character and are frequently within 0.02 cosine distance, so dense retrieval alone cannot separate them." },
    { rank: 4, chunk_id: "reranking.md::1", dense_score: 0.729, bm25_score: 6.41, rerank_score: 0.512, used: false, text: "The cross-encoder reranker scores each query-chunk pair jointly rather than comparing independent embeddings. It runs over the top 8 fused candidates only, since latency grows linearly with the rerank window." },
    { rank: 5, chunk_id: "chunking.md::7", dense_score: 0.701, bm25_score: 4.10, rerank_score: 0.338, used: false, text: "Chunks are split on heading boundaries with a 64-token overlap. Oversized sections fall back to a recursive character splitter at 512 tokens." },
    { rank: 6, chunk_id: "eval-harness.md::4", dense_score: 0.688, bm25_score: 2.95, rerank_score: 0.201, used: false, text: "The evaluation set holds 480 questions drawn from resolved support threads, each labelled with the chunk that contains the answer. Recall@10 is the headline metric; faithfulness is scored separately." },
    { rank: 7, chunk_id: "hybrid-search.md::9", dense_score: 0.652, bm25_score: 1.74, rerank_score: 0.117, used: false, text: "Weighted score interpolation was tried before RRF and abandoned: it required per-corpus tuning of the alpha term and degraded whenever the BM25 score distribution shifted after reindexing." },
    { rank: 8, chunk_id: "faq.md::12", dense_score: 0.640, bm25_score: 0.0, rerank_score: 0.094, used: false, text: "Reindexing runs nightly. Queries served during a reindex read from the previous snapshot, so retrieval results stay consistent within a session." },
  ],
};

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

const C = {
  bg: "oklch(0.16 0.008 264)",
  panel: "oklch(0.19 0.009 264)",
  panelAlt: "oklch(0.21 0.01 264)",
  well: "oklch(0.145 0.008 264)",
  border: "oklch(0.27 0.011 264)",
  borderSoft: "oklch(0.235 0.01 264)",
  borderStrong: "oklch(0.30 0.012 264)",
  text: "oklch(0.93 0.006 264)",
  textSoft: "oklch(0.74 0.008 264)",
  muted: "oklch(0.58 0.012 264)",
  faint: "oklch(0.50 0.012 264)",
  green: "oklch(0.78 0.14 165)",
  amber: "oklch(0.75 0.15 55)",
};

const SANS = "'IBM Plex Sans', system-ui, -apple-system, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
.ragi-input::placeholder { color: oklch(0.52 0.012 264); }
.ragi-input:focus { border-color: oklch(0.55 0.11 165); box-shadow: 0 0 0 3px oklch(0.6 0.12 165 / 0.14); }
.ragi-run:hover { background: oklch(0.84 0.14 165); }
.ragi-run:active { background: oklch(0.72 0.14 165); }
.ragi-run[disabled] { opacity: 0.6; cursor: default; }
.ragi-toggle:hover { background: oklch(0.235 0.011 264); }
.ragi-row:hover { background: oklch(1 0 0 / 0.025); }
`;

const GRID = "56px minmax(190px,1fr) 96px 96px 128px 176px";

const chip = {
  fontFamily: MONO,
  fontSize: 11.5,
  color: "oklch(0.66 0.012 264)",
  padding: "5px 10px",
  border: `1px solid oklch(0.28 0.012 264)`,
  borderRadius: 5,
  background: C.panel,
};

const label = {
  fontFamily: MONO,
  fontSize: 10.5,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: C.muted,
};

const statCard = {
  border: `1px solid ${C.border}`,
  background: C.panel,
  borderRadius: 8,
  padding: "16px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const statValue = { fontFamily: MONO, fontSize: 28, fontWeight: 500, lineHeight: 1 };

const badgeBase = {
  fontFamily: MONO,
  fontSize: 10.5,
  letterSpacing: "0.04em",
  padding: "3px 8px",
  borderRadius: 4,
};

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Stat({ title, value, color, bar }) {
  return (
    <div style={statCard}>
      <span style={label}>{title}</span>
      <span style={{ ...statValue, color: color || C.text }}>{value}</span>
      {bar != null && (
        <div style={{ height: 3, background: "oklch(0.28 0.012 264)", borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
          <div style={{ height: "100%", borderRadius: 2, background: color, width: `${Math.max(bar, 1.5)}%` }} />
        </div>
      )}
    </div>
  );
}

/** Splits answer text on [n] markers and renders them as hoverable badges. */
function AnswerBody({ text, onHoverCite }) {
  const paragraphs = String(text || "").split(/\n{2,}/);
  return (
    <div style={{ padding: "26px 28px 28px", fontSize: 15.5, lineHeight: 1.72, color: "oklch(0.90 0.006 264)", maxWidth: "78ch", textWrap: "pretty" }}>
      {paragraphs.map((para, pi) => (
        <p key={pi} style={{ margin: pi === paragraphs.length - 1 ? 0 : "0 0 16px" }}>
          {para.split(/(\[\d+\])/g).map((part, i) => {
            const m = part.match(/^\[(\d+)\]$/);
            if (!m) return <React.Fragment key={i}>{part}</React.Fragment>;
            const n = Number(m[1]);
            return (
              <span
                key={i}
                onMouseEnter={() => onHoverCite(n)}
                onMouseLeave={() => onHoverCite(null)}
                style={{
                  display: "inline-block",
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "oklch(0.82 0.14 165)",
                  background: "oklch(0.75 0.14 165 / 0.14)",
                  border: "1px solid oklch(0.75 0.14 165 / 0.3)",
                  borderRadius: 4,
                  padding: "1px 5px",
                  margin: "0 2px",
                  verticalAlign: 2,
                  cursor: "default",
                }}
              >
                {n}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

function AnswerPanel({ answer, nUsed, onHoverCite }) {
  return (
    <section style={{ border: "1px solid oklch(0.28 0.012 264)", background: C.panel, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 20px", borderBottom: `1px solid ${C.border}`, background: C.panelAlt }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(0.75 0.15 165)" }} />
        <span style={{ ...label, fontSize: 11, color: "oklch(0.72 0.05 165)" }}>Answer</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: "oklch(0.55 0.012 264)" }}>
          grounded · {nUsed} citation{nUsed === 1 ? "" : "s"}
        </span>
      </div>
      <AnswerBody text={answer} onHoverCite={onHoverCite} />
    </section>
  );
}

function RefusalPanel({ detail, topRerank, threshold }) {
  return (
    <section style={{ border: "1px solid oklch(0.45 0.13 42)", background: "oklch(0.21 0.035 42)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 20px", borderBottom: "1px solid oklch(0.38 0.10 42)", background: "oklch(0.24 0.05 42)" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(0.72 0.16 45)" }} />
        <span style={{ ...label, fontSize: 11, color: "oklch(0.82 0.12 55)" }}>No answer</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: "oklch(0.72 0.06 45)" }}>abstained · 0 citations</span>
      </div>
      <div style={{ padding: "24px 28px 26px", display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "oklch(0.90 0.07 60)", letterSpacing: "-0.01em" }}>
          Not answerable from the provided context.
        </p>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, color: "oklch(0.78 0.03 60)", maxWidth: "74ch", textWrap: "pretty" }}>
          {detail}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            `top_rerank = ${topRerank}`,
            `threshold = ${threshold}`,
            "reason = below_answerability_threshold",
          ].map((t) => (
            <span key={t} style={{ fontFamily: MONO, fontSize: 11.5, color: "oklch(0.80 0.06 55)", padding: "6px 11px", border: "1px solid oklch(0.40 0.09 45)", borderRadius: 5, background: "oklch(0.24 0.04 42)" }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function PassageRow({ p, index, highlighted, expanded, onToggle }) {
  const used = !!p.used;
  const edge = used ? C.green : "oklch(0.32 0.012 264)";
  return (
    <div
      style={{
        borderBottom: `1px solid ${C.borderSoft}`,
        background: highlighted ? "oklch(0.75 0.14 165 / 0.14)" : used ? "oklch(0.72 0.12 165 / 0.055)" : "transparent",
        borderLeft: `2px solid ${edge}`,
      }}
    >
      <div
        className="ragi-row"
        onClick={onToggle}
        style={{
          display: "grid",
          gridTemplateColumns: GRID,
          alignItems: "center",
          gap: 12,
          padding: "11px 20px 11px 18px",
          cursor: "pointer",
          opacity: used ? 1 : 0.72,
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: C.muted }}>
          {String(p.rank ?? index + 1).padStart(2, "0")}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 13, color: used ? "oklch(0.90 0.03 165)" : "oklch(0.72 0.008 264)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.chunk_id}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 12.5, textAlign: "right", color: C.textSoft }}>
          {num(p.dense_score, 3)}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 12.5, textAlign: "right", color: C.textSoft }}>
          {num(p.bm25_score, 2)}
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          <span style={{ fontFamily: MONO, fontSize: 12.5, color: used ? C.green : "oklch(0.70 0.008 264)" }}>
            {num(p.rerank_score, 3)}
          </span>
          <span style={{ width: 72, height: 2, background: "oklch(0.30 0.012 264)", borderRadius: 1, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", background: edge, width: `${Math.max(2, (Number(p.rerank_score) || 0) * 100)}%` }} />
          </span>
        </span>
        <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <span style={{ ...badgeBase, border: "1px solid oklch(0.34 0.012 264)", color: "oklch(0.68 0.012 264)", background: "oklch(0.24 0.01 264)" }}>
            retrieved
          </span>
          <span
            style={{
              ...badgeBase,
              border: `1px solid ${used ? "oklch(0.62 0.12 165 / 0.55)" : "oklch(0.32 0.012 264)"}`,
              color: used ? "oklch(0.86 0.13 165)" : "oklch(0.66 0.012 264)",
              background: used ? "oklch(0.72 0.13 165 / 0.16)" : "oklch(0.22 0.01 264)",
            }}
          >
            {used ? "used" : "ignored"}
          </span>
        </span>
      </div>

      {expanded && (
        <div style={{ padding: "2px 20px 18px 60px", display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontFamily: MONO, fontSize: 12.5, lineHeight: 1.65, color: C.textSoft, background: C.well, border: `1px solid ${C.border}`, borderRadius: 6, padding: "14px 16px", maxWidth: "96ch", textWrap: "pretty" }}>
            {p.text || "No chunk text returned by the pipeline."}
          </p>
          <div style={{ display: "flex", gap: 16, fontFamily: MONO, fontSize: 11, color: "oklch(0.52 0.012 264)" }}>
            {p.tokens != null && <span>tokens {p.tokens}</span>}
            {p.source && <span>source {p.source}</span>}
            {p.offset && <span>offset {p.offset}</span>}
            <span>chunk_id {p.chunk_id}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function num(v, digits) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function RagInspector({
  result = SAMPLE_RESULT,
  onRun,
  running = false,
  defaultDetailsOpen = true,
  index = "support-corpus-v4",
  topK = 4,
  rrfK = 60,
}) {
  const [question, setQuestion] = useState(result?.query || "");
  const [open, setOpen] = useState(defaultDetailsOpen);
  const [expanded, setExpanded] = useState(null);
  const [hoveredCite, setHoveredCite] = useState(null);

  const passages = useMemo(() => result?.passages || [], [result]);
  const refused = !!result?.refused;

  const nRetrieved = result?.n_retrieved ?? passages.length;
  const nUsed = result?.n_used ?? passages.filter((p) => p.used).length;
  const rawUtil = result?.chunk_utilization;
  const util =
    rawUtil == null
      ? nRetrieved ? (nUsed / nRetrieved) * 100 : 0
      : rawUtil <= 1 ? rawUtil * 100 : rawUtil;

  const accent = refused ? C.amber : C.green;
  const topRerank = num(passages[0]?.rerank_score, 3);
  const latency = running ? "—" : result?.latency_ms != null ? formatLatency(result.latency_ms) : "—";

  const submit = () => {
    if (running) return;
    if (typeof onRun === "function") onRun(question);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: SANS, padding: "40px 32px 96px", boxSizing: "border-box" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>

        <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32, flexWrap: "wrap", paddingBottom: 24, borderBottom: "1px solid oklch(0.26 0.01 264)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.015em" }}>RAG Inspector</h1>
            <p style={{ margin: 0, fontSize: 14, color: "oklch(0.64 0.012 264)", maxWidth: "60ch", textWrap: "pretty" }}>
              Run a question through the retrieval pipeline and see the answer next to the evidence it was built from.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...chip, display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(0.75 0.15 165)", boxShadow: "0 0 8px oklch(0.75 0.15 165 / 0.7)" }} />
              corpus: 6 docs / 17 chunks
            </span>
            <span style={chip}>top_k = {topK}</span>
            <span style={chip}>rrf k = {rrfK}</span>
          </div>
        </header>

        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ ...label, fontSize: 11 }}>Query</label>
          <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
            <input
              className="ragi-input"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Ask something about the indexed corpus…"
              style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 14.5, color: "oklch(0.94 0.006 264)", background: "oklch(0.20 0.009 264)", border: `1px solid ${C.borderStrong}`, borderRadius: 8, padding: "15px 18px", outline: "none" }}
            />
            <button
              className="ragi-run"
              onClick={submit}
              disabled={running}
              style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: "oklch(0.17 0.03 165)", background: C.green, border: "none", borderRadius: 8, padding: "0 30px", cursor: "pointer", letterSpacing: "0.01em", minWidth: 110 }}
            >
              {running ? "Running…" : "Run"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 18, fontFamily: MONO, fontSize: 11.5, color: "oklch(0.55 0.012 264)" }}>
            <span>latency {latency}</span>
            <span>embed: all-MiniLM-L6-v2</span>
            <span>rerank: ms-marco-MiniLM-L-6-v2</span>
            <span>gen: claude-sonnet-5</span>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <Stat title="Chunks retrieved" value={nRetrieved} />
          <Stat title="Chunks used" value={nUsed} color={accent} />
          <Stat title="Chunk utilization" value={`${util.toFixed(1)}%`} color={accent} bar={util} />
        </section>

        {!running && (refused ? (
          <RefusalPanel
            detail={
              result?.answer ||
              `${nRetrieved} chunks were retrieved, but none of them mention the queried entity. The generator was instructed to abstain rather than fill the gap from parametric memory.`
            }
            topRerank={topRerank}
            threshold="0.15"
          />
        ) : (
          <AnswerPanel answer={result?.answer} nUsed={nUsed} onHoverCite={setHoveredCite} />
        ))}

        <section style={{ border: `1px solid ${C.border}`, background: "oklch(0.185 0.009 264)", borderRadius: 10, overflow: "hidden" }}>
          <button
            className="ragi-toggle"
            onClick={() => setOpen((o) => !o)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", background: C.panelAlt, border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", textAlign: "left", fontFamily: SANS }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, color: "oklch(0.62 0.012 264)", width: 10, display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▸</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "oklch(0.88 0.006 264)" }}>Retrieval details</span>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: "oklch(0.55 0.012 264)" }}>{nRetrieved} chunks · {nUsed} cited</span>
            <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: C.faint }}>{open ? "collapse" : "expand"}</span>
          </button>

          {open && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: `1px solid ${C.border}`, ...label, fontSize: 10.5, background: "oklch(0.195 0.009 264)" }}>
                <span>Rank</span>
                <span>chunk_id</span>
                <span style={{ textAlign: "right" }}>Dense</span>
                <span style={{ textAlign: "right" }}>BM25</span>
                <span style={{ textAlign: "right" }}>Rerank</span>
                <span style={{ textAlign: "right" }}>Status</span>
              </div>

              {passages.map((p, i) => (
                <PassageRow
                  key={p.chunk_id ? `${p.chunk_id}-${i}` : i}
                  p={p}
                  index={i}
                  highlighted={hoveredCite === (p.rank ?? i + 1)}
                  expanded={expanded === i}
                  onToggle={() => setExpanded((e) => (e === i ? null : i))}
                />
              ))}

              {passages.length === 0 && (
                <div style={{ padding: "22px 20px", fontFamily: MONO, fontSize: 12.5, color: C.faint }}>
                  No passages returned.
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 20px", fontFamily: MONO, fontSize: 11, color: C.faint }}>
                <span>Click a row to inspect the chunk text.</span>
                <span style={{ marginLeft: "auto" }}>fusion = rrf · rerank_window = {topK}</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function formatLatency(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`;
}

export { SAMPLE_RESULT };
