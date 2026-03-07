import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { StatsPanel } from "./StatsPanel";
import { DiffPanel } from "./DiffPanel";
import { ExportDialog } from "../export/ExportDialog";
import { runSQL, generateSchema, optimizeSQL } from "../../lib/api";

export function DataPreview() {
  const {
    previewData, profile, activePanel, setActivePanel,
    currentSQL, setCurrentSQL, datasetName, setPreviewData,
    isLoading, setLoading,
  } = useAppStore();

  const [showExport, setShowExport] = useState(false);
  const [sqlInput, setSqlInput] = useState("");
  const [sqlRunning, setSqlRunning] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlRows, setSqlRows] = useState<Record<string, unknown>[] | null>(null);

  const panels = [
    { id: "data" as const, label: "Data" },
    { id: "sql" as const, label: "SQL" },
    { id: "stats" as const, label: "Stats" },
    { id: "diff" as const, label: "Diff" },
  ];

  const columns = previewData.length > 0 ? Object.keys(previewData[0]) : [];

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
      <div className="flex items-center px-3 py-2 border-b border-pureql-border shrink-0 gap-2">
        <span className="text-[10px] font-semibold text-zinc-500 tracking-wide">PREVIEW</span>
        <div className="flex gap-1">
          {panels.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePanel(p.id)}
              className={`text-[10px] px-2.5 py-1 rounded transition ${
                activePanel === p.id
                  ? "bg-pureql-accent-dim text-pureql-accent border border-pureql-accent/30"
                  : "text-zinc-500 border border-pureql-border hover:text-zinc-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {profile && (
            <span className="text-[10px] text-zinc-600">
              {(sqlRows ?? previewData).length} / {profile.rowCount.toLocaleString()} rows
            </span>
          )}
          {datasetName && (
            <button
              onClick={() => setShowExport(true)}
              className="text-[10px] px-2.5 py-1 rounded border border-pureql-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition flex items-center gap-1"
            >
              ↑ Export
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
                  <th className="text-left px-2 py-1.5 border-b border-pureql-border text-zinc-600 font-semibold text-[9px] bg-pureql-dark w-10">
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
              </thead>
              <tbody>
                {previewData.map((row, i) => (
                  <tr
                    key={i}
                    className={`${i % 2 === 0 ? "" : "bg-pureql-panel/20"} hover:bg-pureql-card/50`}
                  >
                    <td className="px-2 py-1 border-b border-pureql-border text-zinc-600 text-[10px]">
                      {i + 1}
                    </td>
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="px-2 py-1 border-b border-pureql-border text-zinc-400 max-w-[200px] truncate"
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
              </tbody>
            </table>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
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
              className="w-full h-28 bg-pureql-dark border border-pureql-border rounded-md p-2.5 font-mono text-[11px] text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-pureql-accent/50 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRunSQL();
              }}
            />
            <div className="flex items-center justify-between mt-1.5">
              {sqlError && <span className="text-[10px] text-red-400">{sqlError}</span>}
              {!sqlError && sqlRows && (
                <span className="text-[10px] text-emerald-400">✓ {sqlRows.length} rows returned</span>
              )}
              {!sqlError && !sqlRows && <span />}
              <button
                onClick={handleRunSQL}
                disabled={!sqlInput.trim() || sqlRunning}
                className="text-[10px] px-3 py-1 bg-pureql-accent/20 text-pureql-accent border border-pureql-accent/30 rounded hover:bg-pureql-accent/30 transition disabled:opacity-40"
              >
                {sqlRunning ? "Running…" : "▶ Run (⌘↵)"}
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
    </div>
  );
}
