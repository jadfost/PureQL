import { AlertTriangle } from "lucide-react";
import { useAppStore } from "../../stores/appStore";

function QualityBar({ value }: { value: number }) {
  const color =
    value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="w-full h-1.5 bg-pureql-border rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function NullBar({ pct }: { pct: number }) {
  return (
    <div className="w-full h-1 bg-pureql-border rounded-full overflow-hidden">
      <div
        className="h-full rounded-full bg-red-500/60 transition-all duration-300"
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const lower = type.toLowerCase();
  const isNum = ["int", "float", "i32", "i64", "f32", "f64", "u32", "u64"].some((t) =>
    lower.includes(t)
  );
  const isDate = ["date", "datetime", "time", "duration"].some((t) => lower.includes(t));
  const isBool = lower.includes("bool");

  const cls = isNum
    ? "bg-blue-500/15 text-blue-400 border-blue-500/25"
    : isDate
    ? "bg-violet-500/15 text-violet-400 border-violet-500/25"
    : isBool
    ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
    : "bg-zinc-700/50 text-zinc-400 border-zinc-600/40";

  const label = isNum ? "num" : isDate ? "date" : isBool ? "bool" : "str";

  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${cls}`}>
      {label}
    </span>
  );
}

export function StatsPanel() {
  const { profile } = useAppStore();

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-zinc-600">Load a dataset to see column statistics.</p>
      </div>
    );
  }

  const { columns, qualityScore, rowCount, colCount, duplicateCount, memoryMb, issues } =
    profile;

  return (
    <div className="flex-1 overflow-auto p-3 space-y-3">
      {/* Overview cards */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Rows", value: rowCount.toLocaleString() },
          { label: "Columns", value: colCount },
          { label: "Duplicates", value: duplicateCount.toLocaleString() },
          { label: "Memory", value: `${memoryMb.toFixed(1)} MB` },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-pureql-card border border-pureql-border rounded-md p-2.5"
          >
            <div className="text-[10px] text-zinc-500 mb-0.5">{card.label}</div>
            <div className="text-sm font-semibold text-zinc-200">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Quality score */}
      <div className="bg-pureql-card border border-pureql-border rounded-md p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-zinc-400 tracking-wide">
            QUALITY SCORE
          </span>
          <span
            className={`text-sm font-bold ${
              qualityScore >= 80
                ? "text-emerald-400"
                : qualityScore >= 60
                ? "text-amber-400"
                : "text-red-400"
            }`}
          >
            {qualityScore}/100
          </span>
        </div>
        <QualityBar value={qualityScore} />
        {issues.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {issues.slice(0, 5).map((issue, i) => (
              <div key={i} className="text-[10px] text-amber-400/80 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>{issue}</span>
              </div>
            ))}
            {issues.length > 5 && (
              <div className="text-[10px] text-zinc-600">
                +{issues.length - 5} more issues…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Column stats table */}
      <div className="bg-pureql-card border border-pureql-border rounded-md overflow-hidden">
        <div className="px-3 py-2 border-b border-pureql-border">
          <span className="text-[10px] font-semibold text-zinc-500 tracking-wide">
            COLUMNS
          </span>
        </div>
        <div className="divide-y divide-pureql-border">
          {columns.map((col) => (
            <div key={col.name} className="px-3 py-2 hover:bg-pureql-panel/30 transition-colors">
              {/* Column header row */}
              <div className="flex items-center gap-2 mb-1.5">
                <TypeBadge type={col.type} />
                <span className="text-[11px] font-medium text-zinc-300 truncate flex-1">
                  {col.name}
                </span>
                <span className="text-[10px] text-zinc-500 shrink-0 font-mono">
                  {col.uniqueCount.toLocaleString()} uniq
                </span>
              </div>

              {/* Null bar */}
              {col.nullPct > 0 && (
                <div className="mb-1.5">
                  <div className="flex justify-between text-[9px] text-zinc-600 mb-0.5">
                    <span>nulls</span>
                    <span className="text-red-400/80">{col.nullPct.toFixed(1)}%</span>
                  </div>
                  <NullBar pct={col.nullPct} />
                </div>
              )}

              {/* Sample values */}
              {col.sampleValues && col.sampleValues.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {col.sampleValues.slice(0, 4).map((v, i) => (
                    <span
                      key={i}
                      className="text-[9px] px-1.5 py-0.5 bg-pureql-dark border border-pureql-border rounded text-zinc-500 font-mono truncate max-w-[80px]"
                      title={v}
                    >
                      {v}
                    </span>
                  ))}
                </div>
              )}

              {/* Column-level issues */}
              {col.issues && col.issues.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {col.issues.map((issue, i) => (
                    <div key={i} className="text-[9px] text-amber-400/70 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}