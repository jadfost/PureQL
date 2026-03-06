import { useAppStore } from "../../stores/appStore";

export function DataPreview() {
  const { previewData, profile, activePanel, setActivePanel } = useAppStore();

  const panels = [
    { id: "data" as const, label: "Data" },
    { id: "sql" as const, label: "SQL" },
    { id: "stats" as const, label: "Stats" },
    { id: "diff" as const, label: "Diff" },
  ];

  const columns = previewData.length > 0 ? Object.keys(previewData[0]) : [];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center px-3 py-2 border-b border-pureql-border shrink-0">
        <span className="text-[10px] font-semibold text-zinc-500 tracking-wide">
          PREVIEW
        </span>
        {profile && (
          <span className="text-[10px] text-zinc-600 ml-3">
            {profile.rowCount.toLocaleString()} rows × {profile.colCount} cols
          </span>
        )}
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
        <div className="flex-1 overflow-auto p-2">
          {previewData.length > 0 ? (
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="text-left px-2 py-1.5 border-b border-pureql-border 
                                 text-zinc-500 font-semibold text-[10px] sticky top-0 bg-pureql-dark"
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
                    className={i % 2 === 0 ? "" : "bg-pureql-panel/30"}
                  >
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="px-2 py-1.5 border-b border-pureql-border text-zinc-400"
                      >
                        {row[col] != null ? String(row[col]) : (
                          <span className="text-red-400/50 italic">null</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
              Load a dataset to see the preview
            </div>
          )}
        </div>
      )}

      {/* SQL Panel */}
      {activePanel === "sql" && (
        <div className="flex-1 overflow-auto p-4">
          <div className="text-[10px] font-semibold text-pink-400 tracking-wide mb-3">
            SQL QUERY
          </div>
          <div className="bg-pureql-dark border border-pureql-border rounded-md p-4 font-mono text-[11px] text-zinc-500">
            -- No SQL generated yet.
            <br />
            -- Ask in the chat: "generate a query for sales by city"
          </div>
        </div>
      )}

      {/* Stats Panel */}
      {activePanel === "stats" && (
        <div className="flex-1 overflow-auto p-4">
          {profile ? (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="Quality Score" value={`${profile.qualityScore}/100`} color="text-pureql-accent" />
                <StatCard label="Rows" value={profile.rowCount.toLocaleString()} color="text-blue-400" />
                <StatCard label="Columns" value={String(profile.colCount)} color="text-purple-400" />
                <StatCard label="Duplicates" value={String(profile.duplicateCount)} color="text-orange-400" />
              </div>
              {profile.issues.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10px] font-semibold text-zinc-500 mb-2">ISSUES DETECTED</div>
                  {profile.issues.map((issue, i) => (
                    <div key={i} className="text-[11px] text-zinc-400 py-1">
                      <span className="text-orange-400 mr-2">⚠</span>{issue}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
              Load a dataset to see statistics
            </div>
          )}
        </div>
      )}

      {/* Diff Panel */}
      {activePanel === "diff" && (
        <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs">
          Select two versions to compare
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
