import { useAppStore } from "../../stores/appStore";

export function DataPreview() {
  const { previewData, profile, activePanel, setActivePanel, currentSQL } = useAppStore();

  const panels = [
    { id: "data" as const, label: "Data" },
    { id: "sql" as const, label: "SQL" },
    { id: "stats" as const, label: "Stats" },
  ];

  const columns = previewData.length > 0 ? Object.keys(previewData[0]) : [];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center px-3 py-2 border-b border-pureql-border shrink-0">
        <span className="text-[10px] font-semibold text-zinc-500 tracking-wide">PREVIEW</span>
        <div className="ml-auto flex gap-1">
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
                      className="text-left px-2 py-1.5 border-b border-pureql-border text-zinc-500 font-semibold text-[10px] bg-pureql-dark"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, i) => (
                  <tr key={i} className={`${i % 2 === 0 ? "" : "bg-pureql-panel/20"} hover:bg-pureql-card/50`}>
                    <td className="px-2 py-1 border-b border-pureql-border text-zinc-600 text-[10px]">
                      {i + 1}
                    </td>
                    {columns.map((col) => (
                      <td key={col} className="px-2 py-1 border-b border-pureql-border text-zinc-400 max-w-[200px] truncate">
                        {row[col] != null ? String(row[col]) : (
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
        <div className="flex-1 overflow-auto p-4">
          <div className="text-[10px] font-semibold text-pink-400 tracking-wide mb-3">
            SQL OUTPUT
          </div>
          {currentSQL ? (
            <pre className="bg-pureql-dark border border-pureql-border rounded-md p-4 font-mono text-[11px] text-zinc-400 whitespace-pre-wrap overflow-auto">
              {currentSQL}
            </pre>
          ) : (
            <div className="bg-pureql-dark border border-pureql-border rounded-md p-4 font-mono text-[11px] text-zinc-600">
              -- No SQL generated yet.{"\n"}
              -- Try: "generate schema for postgresql" or "optimize SELECT * FROM orders"
            </div>
          )}
        </div>
      )}

      {/* Stats Panel */}
      {activePanel === "stats" && (
        <div className="flex-1 overflow-auto p-4">
          {profile ? (
            <div>
              {/* Score cards */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <StatCard label="Quality Score" value={`${profile.qualityScore}/100`} color="text-pureql-accent" />
                <StatCard label="Rows" value={profile.rowCount.toLocaleString()} color="text-blue-400" />
                <StatCard label="Columns" value={String(profile.colCount)} color="text-purple-400" />
                <StatCard label="Duplicates" value={String(profile.duplicateCount)} color="text-orange-400" />
              </div>

              {/* Issues */}
              {profile.issues.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] font-semibold text-zinc-500 mb-2">
                    ISSUES ({profile.issues.length})
                  </div>
                  {profile.issues.map((issue, i) => (
                    <div key={i} className="text-[11px] text-zinc-400 py-1.5 border-b border-pureql-border last:border-0">
                      <span className="text-orange-400 mr-2">⚠</span>{issue}
                    </div>
                  ))}
                </div>
              )}

              {/* Column details */}
              <div className="text-[10px] font-semibold text-zinc-500 mb-2">
                COLUMNS ({profile.colCount})
              </div>
              <div className="space-y-1">
                {profile.columns.map((col) => (
                  <div key={col.name} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-pureql-card/50 text-[11px]">
                    <span className="text-zinc-300 font-medium w-28 truncate">{col.name}</span>
                    <span className="text-zinc-600 w-16">{col.type}</span>
                    <span className={`w-16 ${col.nullCount > 0 ? "text-orange-400" : "text-zinc-600"}`}>
                      {col.nullCount > 0 ? `${col.nullCount} nulls` : "—"}
                    </span>
                    <span className="text-zinc-600">{col.uniqueCount} unique</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
              Load a dataset to see statistics
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-pureql-card border border-pureql-border rounded-lg p-3">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-zinc-500 mt-1">{label}</div>
    </div>
  );
}
