import { useState } from "react";
import { useAppStore } from "../../stores/appStore";

interface DiffResult {
  version_a: string;
  version_b: string;
  rows_a: number;
  rows_b: number;
  row_diff: number;
  cols_a: number;
  cols_b: number;
  columns_added: string[];
  columns_removed: string[];
  columns_common: string[];
  changed_columns: { column: string; cells_changed: number }[];
  error?: string;
}

async function fetchDiff(versionA: string, versionB: string): Promise<DiffResult> {
  const res = await fetch("http://127.0.0.1:9741/diff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ versionA, versionB }),
  });
  return res.json();
}

function DiffBadge({ count, type }: { count: number; type: "added" | "removed" | "changed" }) {
  const cfg = {
    added: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    removed: "bg-red-500/15 text-red-400 border-red-500/25",
    changed: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  };
  const icon = { added: "+", removed: "−", changed: "~" };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${cfg[type]}`}>
      {icon[type]}{count}
    </span>
  );
}

export function DiffPanel() {
  const { versions } = useAppStore();
  const [versionA, setVersionA] = useState<string>("");
  const [versionB, setVersionB] = useState<string>("");
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCompare = versionA && versionB && versionA !== versionB;

  const handleCompare = async () => {
    if (!canCompare) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDiff(versionA, versionB);
      if (result.error) {
        setError(result.error);
      } else {
        setDiff(result);
      }
    } catch (e) {
      setError("Failed to fetch diff from bridge.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-set to last two versions on load
  const handleAutoSelect = () => {
    if (versions.length >= 2) {
      setVersionA(versions[versions.length - 2].id);
      setVersionB(versions[versions.length - 1].id);
    }
  };

  if (versions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-zinc-600">No versions to compare yet.</p>
      </div>
    );
  }

  const versionLabel = (id: string) =>
    versions.find((v) => v.id === id)?.label ?? id.slice(0, 8);

  return (
    <div className="flex-1 overflow-auto p-3 space-y-3">
      {/* Selector */}
      <div className="bg-pureql-card border border-pureql-border rounded-md p-3">
        <div className="text-[10px] font-semibold text-zinc-500 tracking-wide mb-2">
          COMPARE VERSIONS
        </div>
        <div className="flex items-center gap-2">
          <select
            value={versionA}
            onChange={(e) => setVersionA(e.target.value)}
            className="flex-1 bg-pureql-dark border border-pureql-border rounded text-[11px] text-zinc-300 px-2 py-1.5 focus:outline-none focus:border-pureql-accent/50"
          >
            <option value="">Select version A</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>

          <span className="text-zinc-600 text-sm shrink-0">→</span>

          <select
            value={versionB}
            onChange={(e) => setVersionB(e.target.value)}
            className="flex-1 bg-pureql-dark border border-pureql-border rounded text-[11px] text-zinc-300 px-2 py-1.5 focus:outline-none focus:border-pureql-accent/50"
          >
            <option value="">Select version B</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>

          <button
            onClick={handleCompare}
            disabled={!canCompare || loading}
            className="shrink-0 px-3 py-1.5 bg-pureql-accent/20 text-pureql-accent border border-pureql-accent/30 rounded text-[11px] hover:bg-pureql-accent/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "…" : "Compare"}
          </button>
        </div>

        {versions.length >= 2 && !versionA && !versionB && (
          <button
            onClick={handleAutoSelect}
            className="mt-2 text-[10px] text-zinc-600 hover:text-zinc-400 transition"
          >
            ↳ Compare last two versions
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* Results */}
      {diff && (
        <>
          {/* Summary row */}
          <div className="bg-pureql-card border border-pureql-border rounded-md p-3">
            <div className="text-[10px] font-semibold text-zinc-500 tracking-wide mb-2">
              SUMMARY — {versionLabel(diff.version_a)} → {versionLabel(diff.version_b)}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">Rows</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-zinc-300 font-mono">
                    {diff.rows_a.toLocaleString()} → {diff.rows_b.toLocaleString()}
                  </span>
                  {diff.row_diff !== 0 && (
                    <DiffBadge
                      count={Math.abs(diff.row_diff)}
                      type={diff.row_diff < 0 ? "removed" : "added"}
                    />
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">Columns</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-zinc-300 font-mono">
                    {diff.cols_a} → {diff.cols_b}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 mb-0.5">Changed cols</div>
                <div className="text-[11px] text-zinc-300 font-mono">
                  {diff.changed_columns.length}
                </div>
              </div>
            </div>
          </div>

          {/* Column changes */}
          {(diff.columns_added.length > 0 || diff.columns_removed.length > 0) && (
            <div className="bg-pureql-card border border-pureql-border rounded-md p-3">
              <div className="text-[10px] font-semibold text-zinc-500 tracking-wide mb-2">
                COLUMN CHANGES
              </div>
              <div className="space-y-1">
                {diff.columns_added.map((col) => (
                  <div key={col} className="flex items-center gap-2">
                    <DiffBadge count={1} type="added" />
                    <span className="text-[11px] text-zinc-300 font-mono">{col}</span>
                  </div>
                ))}
                {diff.columns_removed.map((col) => (
                  <div key={col} className="flex items-center gap-2">
                    <DiffBadge count={1} type="removed" />
                    <span className="text-[11px] text-zinc-300 font-mono line-through text-zinc-500">
                      {col}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Value changes */}
          {diff.changed_columns.length > 0 && (
            <div className="bg-pureql-card border border-pureql-border rounded-md overflow-hidden">
              <div className="px-3 py-2 border-b border-pureql-border">
                <span className="text-[10px] font-semibold text-zinc-500 tracking-wide">
                  VALUE CHANGES
                </span>
              </div>
              <div className="divide-y divide-pureql-border">
                {diff.changed_columns.map(({ column, cells_changed }) => {
                  const pct = diff.rows_a > 0 ? (cells_changed / diff.rows_a) * 100 : 0;
                  return (
                    <div
                      key={column}
                      className="px-3 py-2 flex items-center gap-3 hover:bg-pureql-panel/30"
                    >
                      <span className="text-[11px] text-zinc-300 font-mono flex-1 truncate">
                        {column}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1 bg-pureql-border rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500/60 rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-amber-400/80 font-mono w-14 text-right">
                          {cells_changed.toLocaleString()} cells
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {diff.changed_columns.length === 0 &&
            diff.row_diff === 0 &&
            diff.columns_added.length === 0 &&
            diff.columns_removed.length === 0 && (
              <div className="text-[11px] text-zinc-600 text-center py-4">
                No differences found between these versions.
              </div>
            )}
        </>
      )}
    </div>
  );
}
