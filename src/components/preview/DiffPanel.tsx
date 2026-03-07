import { useEffect, useState } from "react";
import { useAppStore } from "../../stores/appStore";
import {
  ArrowRight, RefreshCw, TrendingUp, TrendingDown,
  Minus, Plus, AlertCircle, CheckCircle2,
} from "lucide-react";

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

function StatCard({
  label, before, after, diff, type,
}: {
  label: string;
  before: number;
  after: number;
  diff: number;
  type: "rows" | "cols";
}) {
  const improved = type === "rows" ? diff < 0 : diff > 0;
  const neutral  = diff === 0;
  return (
    <div className="flex flex-col gap-1 px-4 py-3 rounded-xl border border-pureql-border bg-white">
      <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest">{label}</span>
      <div className="flex items-end gap-2">
        <span className="text-lg font-black font-mono text-zinc-700 tabular-nums">{after.toLocaleString()}</span>
        {!neutral && (
          <span className={`flex items-center gap-0.5 text-[10px] font-semibold mb-0.5 ${
            improved ? "text-emerald-500" : "text-red-400"
          }`}>
            {improved
              ? <TrendingDown className="w-3 h-3" />
              : <TrendingUp className="w-3 h-3" />}
            {Math.abs(diff).toLocaleString()}
          </span>
        )}
        {neutral && <span className="text-[10px] text-zinc-400 mb-0.5">no change</span>}
      </div>
      <span className="text-[9px] text-zinc-400 font-mono">from {before.toLocaleString()}</span>
    </div>
  );
}

export function DiffPanel() {
  const { versions, currentVersionId } = useAppStore();
  const [versionA, setVersionA] = useState("");
  const [versionB, setVersionB] = useState("");
  const [diff, setDiff]         = useState<DiffResult | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Auto-select: A = previous version, B = current
  useEffect(() => {
    if (versions.length < 2) return;
    const currentIdx = versions.findIndex((v) => v.id === currentVersionId);
    const bIdx = currentIdx >= 0 ? currentIdx : versions.length - 1;
    const aIdx = bIdx > 0 ? bIdx - 1 : 0;
    if (aIdx !== bIdx) {
      setVersionA(versions[aIdx].id);
      setVersionB(versions[bIdx].id);
    }
  }, [versions, currentVersionId]);

  // Auto-run whenever A and B are both set
  useEffect(() => {
    if (!versionA || !versionB || versionA === versionB) return;
    runDiff();
  }, [versionA, versionB]);

  const runDiff = async () => {
    if (!versionA || !versionB || versionA === versionB) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDiff(versionA, versionB);
      if (result.error) setError(result.error);
      else setDiff(result);
    } catch {
      setError("Failed to fetch diff from bridge.");
    } finally {
      setLoading(false);
    }
  };

  const labelOf = (id: string) =>
    versions.find((v) => v.id === id)?.label ?? id.slice(0, 8);
  const descOf = (id: string) =>
    versions.find((v) => v.id === id)?.description ?? "";

  if (versions.length < 2) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
        <div className="w-10 h-10 rounded-xl bg-pureql-panel border border-pureql-border flex items-center justify-center">
          <ArrowRight className="w-5 h-5 text-zinc-400" />
        </div>
        <p className="text-xs font-medium text-zinc-500">Need at least 2 versions to compare</p>
        <p className="text-[10px] text-zinc-400">Apply a cleaning operation first.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-3 space-y-3">

      {/* Version selector */}
      <div className="bg-white border border-pureql-border rounded-xl p-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase">Compare versions</span>
          <button onClick={runDiff} disabled={loading || !versionA || !versionB || versionA === versionB}
            className="ml-auto flex items-center gap-1 text-[10px] text-pureql-accent bg-pureql-accent-dim border border-pureql-accent/30 px-2 py-1 rounded-lg hover:bg-pureql-accent/20 disabled:opacity-40 transition">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Comparing…" : "Refresh"}
          </button>
        </div>

        <div className="flex items-stretch gap-2">
          {/* Version A */}
          <div className="flex-1">
            <label className="text-[9px] font-semibold text-zinc-400 mb-1 block uppercase tracking-widest">Before</label>
            <select value={versionA} onChange={(e) => setVersionA(e.target.value)}
              className="w-full text-[11px] px-2.5 py-2 rounded-lg border border-pureql-border bg-pureql-panel focus:outline-none focus:border-pureql-accent">
              <option value="">Select…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.label} — {v.description?.slice(0, 28)}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end pb-2">
            <ArrowRight className="w-4 h-4 text-zinc-300" />
          </div>

          {/* Version B */}
          <div className="flex-1">
            <label className="text-[9px] font-semibold text-zinc-400 mb-1 block uppercase tracking-widest">After</label>
            <select value={versionB} onChange={(e) => setVersionB(e.target.value)}
              className="w-full text-[11px] px-2.5 py-2 rounded-lg border border-pureql-border bg-pureql-panel focus:outline-none focus:border-pureql-accent">
              <option value="">Select…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.label} — {v.description?.slice(0, 28)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Version descriptions */}
        {versionA && versionB && (
          <div className="flex gap-2 mt-2">
            <p className="flex-1 text-[10px] text-zinc-400 truncate">{descOf(versionA)}</p>
            <ArrowRight className="w-3 h-3 text-zinc-300 shrink-0 mt-0.5" />
            <p className="flex-1 text-[10px] text-zinc-400 truncate text-right">{descOf(versionB)}</p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-[11px] text-red-600">{error}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2 animate-pulse">
          <div className="grid grid-cols-3 gap-2">
            {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-zinc-100" />)}
          </div>
          <div className="h-32 rounded-xl bg-zinc-100" />
        </div>
      )}

      {/* Results */}
      {diff && !loading && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Rows" before={diff.rows_a} after={diff.rows_b} diff={diff.row_diff} type="rows" />
            <StatCard label="Columns" before={diff.cols_a} after={diff.cols_b} diff={diff.cols_b - diff.cols_a} type="cols" />
            <div className="flex flex-col gap-1 px-4 py-3 rounded-xl border border-pureql-border bg-white">
              <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest">Changed cells</span>
              <span className="text-lg font-black font-mono text-zinc-700 tabular-nums">
                {diff.changed_columns.reduce((s, c) => s + c.cells_changed, 0).toLocaleString()}
              </span>
              <span className="text-[9px] text-zinc-400">across {diff.changed_columns.length} cols</span>
            </div>
          </div>

          {/* No differences */}
          {diff.row_diff === 0 && diff.changed_columns.length === 0 &&
           diff.columns_added.length === 0 && diff.columns_removed.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-[11px] text-emerald-700 font-medium">
                No differences found between {labelOf(versionA)} and {labelOf(versionB)}.
              </span>
            </div>
          )}

          {/* Column structure changes */}
          {(diff.columns_added.length > 0 || diff.columns_removed.length > 0) && (
            <div className="bg-white border border-pureql-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-pureql-border bg-pureql-panel">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Column changes</span>
              </div>
              <div className="p-3 space-y-1.5">
                {diff.columns_added.map((col) => (
                  <div key={col} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                    <Plus className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="text-[11px] text-emerald-700 font-mono font-semibold">{col}</span>
                    <span className="text-[9px] text-emerald-500 ml-auto">added</span>
                  </div>
                ))}
                {diff.columns_removed.map((col) => (
                  <div key={col} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <Minus className="w-3 h-3 text-red-400 shrink-0" />
                    <span className="text-[11px] text-red-500 font-mono font-semibold line-through">{col}</span>
                    <span className="text-[9px] text-red-400 ml-auto">removed</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Value changes per column */}
          {diff.changed_columns.length > 0 && (
            <div className="bg-white border border-pureql-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-pureql-border bg-pureql-panel flex items-center justify-between">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Cell changes by column</span>
                <span className="text-[9px] text-zinc-400">{diff.changed_columns.length} columns</span>
              </div>
              <div className="divide-y divide-pureql-border">
                {diff.changed_columns
                  .sort((a, b) => b.cells_changed - a.cells_changed)
                  .map(({ column, cells_changed }) => {
                    const pct = diff.rows_a > 0 ? (cells_changed / diff.rows_a) * 100 : 0;
                    const heat = pct > 50 ? "bg-amber-400" : pct > 20 ? "bg-amber-300" : "bg-amber-200";
                    return (
                      <div key={column} className="flex items-center gap-3 px-4 py-2.5 hover:bg-pureql-panel/50 transition">
                        <span className="text-[11px] text-zinc-600 font-mono flex-1 truncate">{column}</span>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className="w-24 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                            <div className={`h-full ${heat} rounded-full transition-all`}
                              style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-zinc-500 w-16 text-right">
                            {cells_changed.toLocaleString()} cells
                          </span>
                          <span className="text-[9px] text-zinc-400 w-10 text-right">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}