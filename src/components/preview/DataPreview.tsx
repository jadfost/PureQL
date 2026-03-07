import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { StatsPanel } from "./StatsPanel";
import { DiffPanel } from "./DiffPanel";
import { ExportDialog } from "../export/ExportDialog";
import { runSQL, generateSchema, optimizeSQL, autoClean } from "../../lib/api";
import { Upload, Play, Check, Sparkles, X, CheckCircle2, AlertCircle } from "lucide-react";

/* ── Auto Clean Modal ────────────────────────────────────────────────────── */
function AutoCleanModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { setPreviewData, setVersions, setLoading, isLoading, profile } = useAppStore();
  const [ops, setOps]         = useState<{ operation: string; description: string; rowsAffected: number }[]>([]);
  const [newScore, setNewScore] = useState<number | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const handleRun = async () => {
    setStarted(true);
    setLoading(true);
    setError(null);
    try {
      const res = await autoClean();
      if (res.preview)  setPreviewData(res.preview);
      if (res.versions) setVersions(res.versions);
      setOps(res.operations ?? []);
      setNewScore(res.qualityScore ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auto-clean failed");
    } finally {
      setLoading(false);
    }
  };

  const isDone = started && !isLoading && !error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-[440px] flex flex-col bg-white border border-pureql-border rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-pureql-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-pureql-accent-dim border border-pureql-accent/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-pureql-accent" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-800">Auto Clean</h2>
              <p className="text-[10px] text-zinc-400">AI-powered dataset cleaning</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Current state */}
          {profile && !started && (
            <div className="grid grid-cols-2 gap-3">
              <div className="px-4 py-3 rounded-xl bg-pureql-panel border border-pureql-border">
                <p className="text-[9px] text-zinc-400 uppercase tracking-widest mb-1">Current score</p>
                <span className={`text-2xl font-black ${
                  profile.qualityScore >= 80 ? "text-emerald-500" :
                  profile.qualityScore >= 60 ? "text-amber-500" : "text-red-400"
                }`}>{profile.qualityScore}</span>
                <span className="text-sm text-zinc-400">/100</span>
              </div>
              <div className="px-4 py-3 rounded-xl bg-pureql-panel border border-pureql-border">
                <p className="text-[9px] text-zinc-400 uppercase tracking-widest mb-1">Issues found</p>
                <span className="text-2xl font-black text-zinc-700">{profile.issues?.length ?? 0}</span>
                <span className="text-sm text-zinc-400"> items</span>
              </div>
            </div>
          )}

          {/* Issues list */}
          {profile?.issues && profile.issues.length > 0 && !started && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Will fix</p>
              {profile.issues.slice(0, 5).map((issue, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                  <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="text-[11px] text-amber-700">{issue}</span>
                </div>
              ))}
              {profile.issues.length > 5 && (
                <p className="text-[10px] text-zinc-400 pl-1">+{profile.issues.length - 5} more issues</p>
              )}
            </div>
          )}

          {/* Running */}
          {started && isLoading && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-10 h-10 border-2 border-pureql-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-zinc-500">Cleaning your dataset…</p>
              <p className="text-[10px] text-zinc-400">Detecting duplicates, outliers, and format issues</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-[11px] text-red-600">{error}</span>
            </div>
          )}

          {/* Results */}
          {isDone && (
            <div className="space-y-2">
              {/* Score improvement */}
              {newScore !== null && profile && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold text-emerald-700">Cleaning complete!</p>
                    <p className="text-[10px] text-emerald-600">
                      Score: <strong>{profile.qualityScore}</strong> → <strong>{newScore}/100</strong>
                      {newScore > profile.qualityScore && ` (+${newScore - profile.qualityScore})`}
                    </p>
                  </div>
                </div>
              )}
              {/* Operations list */}
              {ops.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Operations applied</p>
                  {ops.map((op, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg border border-pureql-border bg-white">
                      <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-medium text-zinc-700">{op.description}</p>
                        {op.rowsAffected > 0 && (
                          <p className="text-[9px] text-zinc-400">{op.rowsAffected.toLocaleString()} rows affected</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-sky-50 border border-sky-200">
                  <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="text-[11px] text-sky-700">Dataset is already clean — no changes needed!</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-pureql-border bg-pureql-panel">
          <button onClick={isDone ? onDone : onClose}
            className="px-4 py-2 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 transition">
            {isDone ? "Close" : "Cancel"}
          </button>
          {!started && (
            <button onClick={handleRun}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-pureql-accent text-white text-[11px] font-semibold hover:bg-sky-600 transition">
              <Sparkles className="w-3.5 h-3.5" />
              Run Auto Clean
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── DataPreview ─────────────────────────────────────────────────────────── */

export function DataPreview() {
  const {
    previewData, profile, activePanel, setActivePanel,
    currentSQL, setCurrentSQL, datasetName, setPreviewData,
    isLoading, setLoading, versions, currentVersionId,
  } = useAppStore();

  const [showExport, setShowExport]         = useState(false);
  const [showAutoClean, setShowAutoClean]   = useState(false);
  const [sqlInput, setSqlInput] = useState("");
  const [sqlRunning, setSqlRunning] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlRows, setSqlRows] = useState<Record<string, unknown>[] | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const panels = [
    { id: "data" as const, label: "Data" },
    { id: "sql" as const, label: "SQL" },
    { id: "stats" as const, label: "Stats" },
    { id: "diff" as const, label: "Diff" },
  ];

  const columns = previewData.length > 0 ? Object.keys(previewData[0]) : [];

  // Use active version's rowCount if available, otherwise profile total
  const activeVersion = versions.find((v) => v.id === currentVersionId);
  const currentTotalRows = activeVersion?.rowCount ?? profile?.rowCount ?? 0;

  // Client-side column filtering over the preview slice
  const activeFilters = Object.entries(columnFilters).filter(([, v]) => v.trim() !== "");
  const filteredData = activeFilters.length === 0
    ? (sqlRows ?? previewData)
    : (sqlRows ?? previewData).filter((row) =>
        activeFilters.every(([col, val]) =>
          String(row[col] ?? "").toLowerCase().includes(val.toLowerCase())
        )
      );

  const hasFilters = activeFilters.length > 0;

  const handleRunSQL = async () => {
    if (!sqlInput.trim()) return;
    setSqlRunning(true);
    setSqlError(null);
    setSqlRows(null);
    try {
      const res = await runSQL(sqlInput);
      setSqlRows(res.preview);
      setPreviewData(res.preview);
    } catch (e) {
      setSqlError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setSqlRunning(false);
    }
  };

  const handleGenerateSchema = async () => {
    setLoading(true);
    try {
      const res = await generateSchema("data", "postgresql");
      setCurrentSQL(res.sql + "\n\n-- Suggested indexes:\n" + res.indexes.join("\n"));
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    if (!sqlInput.trim()) return;
    try {
      const res = await optimizeSQL(sqlInput);
      setSqlInput(res.sql);
      setCurrentSQL(res.sql);
    } catch {}
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center px-3 py-2 border-b shrink-0 gap-2" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <span className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-faint)" }}>Preview</span>
        <div className="flex gap-0.5">
          {panels.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePanel(p.id)}
              className="text-[10px] px-2.5 py-1 rounded-lg transition-all duration-150 font-medium border"
              style={activePanel === p.id
                ? { background: "var(--accent-subtle)", color: "var(--accent)", borderColor: "var(--accent-border)" }
                : { background: "transparent", color: "var(--text-faint)", borderColor: "transparent" }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {profile && (
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
              {hasFilters
                ? `${filteredData.length} filtered`
                : `${Math.min(filteredData.length, 100)} / ${currentTotalRows.toLocaleString()} rows`}
            </span>
          )}
          {hasFilters && (
            <button
              onClick={() => setColumnFilters({})}
              className="text-[10px] px-2 py-0.5 rounded-lg border transition-all flex items-center gap-1"
              style={{ borderColor: "var(--accent-border)", color: "var(--accent)", background: "var(--accent-subtle)" }}
            >
              <X className="w-2.5 h-2.5" /> Clear filters
            </button>
          )}
          {datasetName && (
            <button
              onClick={() => setShowAutoClean(true)}
              className="text-[10px] px-2.5 py-1 rounded-lg border transition-all duration-150 flex items-center gap-1.5 font-medium"
              style={{ borderColor: "var(--accent-border)", color: "var(--accent)", background: "var(--accent-subtle)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-muted)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent-subtle)"; }}
            >
              <Sparkles className="w-3 h-3" />
              Auto Clean
            </button>
          )}
          {datasetName && (
            <button
              onClick={() => setShowExport(true)}
              className="text-[10px] px-2.5 py-1 rounded-lg border transition-all duration-150 flex items-center gap-1.5"
              style={{ borderColor: "var(--border)", color: "var(--text-faint)", background: "transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-faint)"; }}
            >
              <Upload className="w-3 h-3" />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Data Table */}
      {activePanel === "data" && (
        <div className="flex-1 overflow-auto">
          {previewData.length > 0 ? (
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="text-left px-2 py-1.5 border-b w-10 font-semibold text-[9px]" style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text-faint)" }}>
                    #
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="text-left px-2 py-1.5 border-b border-pureql-border text-zinc-500 font-semibold text-[10px] bg-pureql-dark whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
                {/* Filter row */}
                <tr style={{ background: "var(--bg)" }}>
                  <td className="px-1 py-1 border-b" style={{ borderColor: "var(--border)" }} />
                  {columns.map((col) => (
                    <td key={col} className="px-1 py-1 border-b" style={{ borderColor: "var(--border)" }}>
                      <input
                        type="text"
                        value={columnFilters[col] ?? ""}
                        onChange={(e) =>
                          setColumnFilters((prev) => ({ ...prev, [col]: e.target.value }))
                        }
                        placeholder="filter…"
                        className="w-full rounded px-1.5 py-0.5 text-[10px] focus:outline-none"
                        style={{
                          background: columnFilters[col] ? "var(--accent-subtle)" : "var(--bg-sunken)",
                          border: `1px solid ${columnFilters[col] ? "var(--accent-border)" : "var(--border)"}`,
                          color: "var(--text-secondary)",
                        }}
                      />
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, i) => (
                  <tr
                    key={i}
                    className={`${i % 2 === 0 ? "" : "bg-pureql-panel/20"} hover:bg-pureql-card/50`}
                  >
                    <td className="px-2 py-1 border-b text-[10px]" style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}>
                      {i + 1}
                    </td>
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="px-2 py-1 border-b max-w-[200px] truncate"
                        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                      >
                        {row[col] != null ? (
                          String(row[col])
                        ) : (
                          <span className="text-red-400/40 italic text-[10px]">null</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {filteredData.length === 0 && hasFilters && (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
                      No rows match the current filters.
                      <button
                        onClick={() => setColumnFilters({})}
                        className="ml-2 text-[10px] underline"
                        style={{ color: "var(--accent)" }}
                      >
                        Clear filters
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <div className="flex items-center justify-center h-full text-xs" style={{ color: "var(--text-faint)" }}>
              No data to display
            </div>
          )}
        </div>
      )}

      {/* SQL Panel */}
      {activePanel === "sql" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-pureql-border shrink-0">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] font-semibold text-pink-400 tracking-wide">SQL EDITOR</span>
              <div className="ml-auto flex gap-1">
                <button
                  onClick={handleGenerateSchema}
                  disabled={!profile || isLoading}
                  className="text-[10px] px-2 py-0.5 border border-pureql-border rounded text-zinc-500 hover:text-zinc-300 transition disabled:opacity-40"
                >
                  Generate schema
                </button>
                <button
                  onClick={handleOptimize}
                  disabled={!sqlInput.trim()}
                  className="text-[10px] px-2 py-0.5 border border-pureql-border rounded text-zinc-500 hover:text-zinc-300 transition disabled:opacity-40"
                >
                  Optimize
                </button>
              </div>
            </div>
            <textarea
              value={sqlInput}
              onChange={(e) => setSqlInput(e.target.value)}
              placeholder={"SELECT * FROM data LIMIT 100\n-- Use 'data' to reference your dataset"}
              className="w-full h-28 rounded-lg p-2.5 font-mono text-[11px] resize-none focus:outline-none"
              style={{ background: "var(--bg-sunken)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRunSQL();
              }}
            />
            <div className="flex items-center justify-between mt-1.5">
              {sqlError && <span className="text-[10px] text-red-400">{sqlError}</span>}
              {!sqlError && sqlRows && (
                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  {sqlRows.length} rows returned
                </span>
              )}
              {!sqlError && !sqlRows && <span />}
              <button
                onClick={handleRunSQL}
                disabled={!sqlInput.trim() || sqlRunning}
                className="text-[10px] px-3 py-1 bg-pureql-accent/20 text-pureql-accent border border-pureql-accent/30 rounded hover:bg-pureql-accent/30 transition disabled:opacity-40 flex items-center gap-1.5"
              >
                <Play className="w-3 h-3" />
                {sqlRunning ? "Running…" : "Run (⌘↵)"}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-3">
            {currentSQL ? (
              <pre className="bg-pureql-dark border border-pureql-border rounded-md p-3 font-mono text-[11px] text-zinc-400 whitespace-pre-wrap">
                {currentSQL}
              </pre>
            ) : (
              <div className="font-mono text-[11px] text-zinc-700 p-3">
                {"-- Generated SQL and optimizations appear here\n-- Try asking the AI: 'generate schema for postgresql'"}
              </div>
            )}
          </div>
        </div>
      )}

      {activePanel === "stats" && <StatsPanel />}
      {activePanel === "diff" && <DiffPanel />}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showAutoClean && (
        <AutoCleanModal
          onClose={() => setShowAutoClean(false)}
          onDone={() => setShowAutoClean(false)}
        />
      )}

      {/* Low quality score banner */}
      {profile && profile.qualityScore < 70 && activePanel === "data" && !showAutoClean && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-t border-amber-200 bg-amber-50">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-[11px] text-amber-700 flex-1">
            Quality score is <strong>{profile.qualityScore}/100</strong> — {profile.issues?.length ?? 0} issues detected.
          </p>
          <button
            onClick={() => setShowAutoClean(true)}
            className="shrink-0 flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-300 px-2.5 py-1.5 rounded-lg hover:bg-amber-200 transition"
          >
            <Sparkles className="w-3 h-3" />
            Fix automatically
          </button>
        </div>
      )}
    </div>
  );
}