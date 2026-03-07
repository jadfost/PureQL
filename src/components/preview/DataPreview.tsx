import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { StatsPanel } from "./StatsPanel";
import { DiffPanel } from "./DiffPanel";
import { ExportDialog } from "../export/ExportDialog";
import { DataTable } from "../shared/DataTable";
import { runSQL, generateSchema, optimizeSQL, autoClean } from "../../lib/api";
import { Upload, Play, Check, Sparkles, X, CheckCircle2, AlertCircle, GitBranch, Code2 } from "lucide-react";

/* ── AutoCleanModal ──────────────────────────────────────────────────────── */

function AutoCleanModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { setPreviewData, setVersions, setLoading } = useAppStore();
  const [running, setRunning] = useState(false);
  const [ops, setOps] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    setLoading(true);
    try {
      const res = await autoClean();
      if (res.preview) setPreviewData(res.preview);
      if (res.versions) setVersions(res.versions);
      setOps(res.operations.map((o: any) => o.description));
      setDone(true);
    } catch (err) {
      setOps([`Error: ${err instanceof Error ? err.message : "Unknown"}`]);
    } finally {
      setRunning(false);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border shadow-xl w-full max-w-sm p-5 flex flex-col gap-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: "var(--accent)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Auto Clean</span>
          <button onClick={onClose} className="ml-auto p-1 rounded text-zinc-400 hover:text-zinc-600 transition"><X className="w-4 h-4" /></button>
        </div>
        {!done ? (
          <>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              PureQL will automatically detect and fix duplicates, normalize formats, and improve data quality.
            </p>
            <button onClick={handleRun} disabled={running}
              className="flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition"
              style={{ background: "var(--gradient-accent)", color: "white" }}>
              {running
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Cleaning…</>
                : <><Sparkles className="w-3.5 h-3.5" />Run Auto Clean</>}
            </button>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              {ops.map((op, i) => (
                <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "var(--success)" }} />
                  {op}
                </div>
              ))}
              {ops.length === 0 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Dataset is already clean!</p>}
            </div>
            <button onClick={onDone} className="py-2 rounded-xl text-sm font-semibold transition" style={{ background: "var(--accent-subtle)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
              Done
            </button>
          </>
        )}
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

  // Find the current version to display context
  const activeVersion = versions.find((v) => v.id === currentVersionId)
    ?? (versions.length > 0 ? versions[versions.length - 1] : null);


  const panels = [
    { id: "data" as const, label: "Data" },
    { id: "sql" as const, label: "SQL" },
    { id: "stats" as const, label: "Stats" },
    { id: "diff" as const, label: "Diff" },
  ];

  // Use active version's rowCount if available, otherwise profile total
  const activeVersion = versions.find((v) => v.id === currentVersionId);
  const currentTotalRows = activeVersion?.rowCount ?? profile?.rowCount ?? 0;
  const displayRows = sqlRows ?? previewData;

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
      {/* Version context banner — shows which AI result is being displayed */}
      {activeVersion && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0"
          style={{
            background: "var(--accent-subtle)",
            borderColor: "var(--accent-border)",
          }}
        >
          <GitBranch className="w-3 h-3 shrink-0" style={{ color: "var(--accent)" }} />
          <span className="text-[10px] font-semibold font-mono" style={{ color: "var(--accent)" }}>
            {activeVersion.label}
          </span>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            — {activeVersion.description || activeVersion.label}
          </span>
          {activeVersion.sql && (
            <button
              onClick={() => setActivePanel("sql")}
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border ml-auto transition"
              style={{
                borderColor: "var(--accent-border)",
                color: "var(--accent)",
                background: "white",
              }}
            >
              <Code2 className="w-2.5 h-2.5" />
              View SQL
            </button>
          )}
          {activeVersion.rowCount != null && (
            <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
              {activeVersion.rowCount.toLocaleString()} rows
            </span>
          )}
        </div>
      )}

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
              {`${Math.min(displayRows.length, 100)} / ${currentTotalRows.toLocaleString()} rows`}
            </span>
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
        <div className="flex-1 overflow-hidden">
          <DataTable
            rows={displayRows}
            total={currentTotalRows}
            showToolbar
          />
        </div>
      )}

      {/* SQL Panel */}
      {activePanel === "sql" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-pureql-border shrink-0">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] font-semibold text-pink-400 tracking-wide">SQL EDITOR</span>
              <div className="ml-auto flex gap-1">
                {currentSQL && !sqlInput && (
                  <button
                    onClick={() => setSqlInput(currentSQL)}
                    className="text-[10px] px-2 py-0.5 border border-pureql-border rounded text-sky-400 hover:text-sky-300 transition"
                  >
                    Load AI SQL
                  </button>
                )}
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
              <div>
                <div className="text-[9px] font-semibold mb-2 flex items-center gap-1" style={{ color: "var(--accent)" }}>
                  <Code2 className="w-3 h-3" />
                  AI-generated SQL
                </div>
                <pre className="bg-pureql-dark border border-pureql-border rounded-md p-3 font-mono text-[11px] text-zinc-400 whitespace-pre-wrap">
                  {currentSQL}
                </pre>
              </div>
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