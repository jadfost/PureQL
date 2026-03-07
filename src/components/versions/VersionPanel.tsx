import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import {
  undo as apiUndo,
  redo as apiRedo,
  checkout as apiCheckout,
  compareVersions,
  type VersionCompare,
} from "../../lib/api";
import {
  Undo2, Redo2, GitBranch, Clock, CheckCircle2,
  ChevronRight, Database, Sparkles, Filter, Columns,
  Wand2, Code2, GitCompare, X, ArrowRight, ChevronDown, ChevronUp,
  Layers,
} from "lucide-react";

const ACTION_ICONS: Record<string, React.ElementType> = {
  deduplicate: GitBranch,
  filter: Filter,
  normalize: Wand2,
  add_column: Columns,
  impute: Sparkles,
  default: Database,
};

function getIcon(label: string): React.ElementType {
  const lower = label.toLowerCase();
  for (const key of Object.keys(ACTION_ICONS)) {
    if (lower.includes(key)) return ACTION_ICONS[key];
  }
  return ACTION_ICONS.default;
}

function formatStorage(bytes?: number) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CompareModal({ compare, onClose }: { compare: VersionCompare; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"summary" | "v1" | "v2">("summary");
  const { v1, v2, diff } = compare;

  const scoreDelta = v2.qualityScore - v1.qualityScore;
  const rowDelta = v2.rowCount - v1.rowCount;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-pureql-dark border border-pureql-border rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-pureql-border shrink-0">
          <GitCompare className="w-4 h-4 text-pureql-accent" />
          <span className="text-xs font-semibold text-zinc-400">Version Comparison</span>
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[10px] text-zinc-500 bg-pureql-panel px-2 py-0.5 rounded border border-pureql-border">{v1.label}</span>
            <ArrowRight className="w-3 h-3 text-zinc-600" />
            <span className="text-[10px] text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">{v2.label}</span>
          </div>
          <button onClick={onClose} className="ml-auto p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-pureql-panel transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-pureql-border shrink-0">
          {(["summary", "v1", "v2"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-[11px] font-medium transition border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-pureql-accent text-pureql-accent"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab === "summary" ? "Summary" : tab === "v1" ? v1.label : v2.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "summary" && (
            <div className="space-y-4">
              {/* Delta cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-pureql-panel border border-pureql-border rounded-lg p-3 text-center">
                  <div className={`text-lg font-bold ${rowDelta < 0 ? "text-red-400" : rowDelta > 0 ? "text-emerald-400" : "text-zinc-400"}`}>
                    {rowDelta > 0 ? "+" : ""}{rowDelta.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Rows changed</div>
                </div>
                <div className="bg-pureql-panel border border-pureql-border rounded-lg p-3 text-center">
                  <div className={`text-lg font-bold ${scoreDelta > 0 ? "text-emerald-400" : scoreDelta < 0 ? "text-red-400" : "text-zinc-400"}`}>
                    {scoreDelta > 0 ? "+" : ""}{scoreDelta}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Quality Δ</div>
                </div>
                <div className="bg-pureql-panel border border-pureql-border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-zinc-400">{diff.addedColumns.length + diff.removedColumns.length}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Column changes</div>
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-3">
                {/* v1 info */}
                <div className="bg-pureql-panel border border-pureql-border rounded-lg p-3">
                  <div className="text-[10px] font-semibold text-zinc-400 mb-2">{v1.label}</div>
                  <div className="space-y-1 text-[10px] text-zinc-500">
                    <div className="flex justify-between"><span>Rows</span><span className="text-zinc-300">{v1.rowCount.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Cols</span><span className="text-zinc-300">{v1.colCount}</span></div>
                    <div className="flex justify-between"><span>Quality</span>
                      <span className={v1.qualityScore >= 80 ? "text-emerald-400" : v1.qualityScore >= 60 ? "text-amber-400" : "text-red-400"}>
                        {v1.qualityScore}/100
                      </span>
                    </div>
                  </div>
                  {v1.description && (
                    <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed border-t border-pureql-border pt-2">{v1.description}</p>
                  )}
                </div>

                {/* v2 info */}
                <div className="bg-pureql-panel border border-sky-500/20 rounded-lg p-3">
                  <div className="text-[10px] font-semibold text-sky-400 mb-2">{v2.label}</div>
                  <div className="space-y-1 text-[10px] text-zinc-500">
                    <div className="flex justify-between"><span>Rows</span><span className="text-zinc-300">{v2.rowCount.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Cols</span><span className="text-zinc-300">{v2.colCount}</span></div>
                    <div className="flex justify-between"><span>Quality</span>
                      <span className={v2.qualityScore >= 80 ? "text-emerald-400" : v2.qualityScore >= 60 ? "text-amber-400" : "text-red-400"}>
                        {v2.qualityScore}/100
                      </span>
                    </div>
                  </div>
                  {v2.description && (
                    <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed border-t border-pureql-border pt-2">{v2.description}</p>
                  )}
                </div>
              </div>

              {/* Column changes */}
              {(diff.addedColumns.length > 0 || diff.removedColumns.length > 0) && (
                <div className="bg-pureql-panel border border-pureql-border rounded-lg p-3">
                  <div className="text-[10px] font-semibold text-zinc-400 mb-2">Column Changes</div>
                  <div className="flex flex-wrap gap-1.5">
                    {diff.addedColumns.map((col) => (
                      <span key={col} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/20 text-emerald-400">
                        + {col}
                      </span>
                    ))}
                    {diff.removedColumns.map((col) => (
                      <span key={col} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/20 text-red-400">
                        − {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* SQL diff */}
              {(v1.sql || v2.sql) && (
                <div className="grid grid-cols-2 gap-3">
                  {[{ v: v1, label: "SQL in " + v1.label }, { v: v2, label: "SQL in " + v2.label }].map(({ v, label }) => (
                    <div key={v.id} className="bg-pureql-panel border border-pureql-border rounded-lg p-3">
                      <div className="text-[9px] font-semibold text-zinc-500 mb-2 flex items-center gap-1">
                        <Code2 className="w-3 h-3" />{label}
                      </div>
                      {v.sql ? (
                        <pre className="text-[9px] text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
                          {v.sql}
                        </pre>
                      ) : (
                        <span className="text-[9px] text-zinc-600 italic">No SQL recorded</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(activeTab === "v1" || activeTab === "v2") && (() => {
            const v = activeTab === "v1" ? v1 : v2;
            const cols = v.preview.length > 0 ? Object.keys(v.preview[0]) : [];
            return (
              <div>
                {v.sql && (
                  <div className="mb-4 bg-pureql-panel border border-pureql-border rounded-lg p-3">
                    <div className="text-[9px] font-semibold text-zinc-500 mb-1 flex items-center gap-1">
                      <Code2 className="w-3 h-3" />SQL
                    </div>
                    <pre className="text-[10px] text-pureql-accent font-mono whitespace-pre-wrap">{v.sql}</pre>
                  </div>
                )}
                <div className="overflow-x-auto rounded-lg border border-pureql-border">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-pureql-border bg-pureql-panel">
                        {cols.map((col) => (
                          <th key={col} className="px-3 py-2 text-left font-semibold text-zinc-500 whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {v.preview.map((row, i) => (
                        <tr key={i} className="border-b border-pureql-border/50 hover:bg-pureql-panel/30">
                          {cols.map((col) => (
                            <td key={col} className="px-3 py-1.5 text-zinc-400 whitespace-nowrap max-w-[120px] truncate">
                              {row[col] == null ? <span className="text-zinc-600 italic">null</span> : String(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export function VersionPanel() {
  const {
    versions, currentVersionId,
    setPreviewData, setVersions, setCurrentVersionId, setLoading,
  } = useAppStore();

  const [expandedSQL, setExpandedSQL] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<VersionCompare | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  const handleUndo = async () => {
    setLoading(true);
    try {
      const res = await apiUndo();
      if (res.success && res.preview && res.versions) {
        setPreviewData(res.preview);
        setVersions(res.versions);
        if (res.currentId) setCurrentVersionId(res.currentId);
      }
    } finally { setLoading(false); }
  };

  const handleRedo = async () => {
    setLoading(true);
    try {
      const res = await apiRedo();
      if (res.success && res.preview && res.versions) {
        setPreviewData(res.preview);
        setVersions(res.versions);
        if (res.currentId) setCurrentVersionId(res.currentId);
      }
    } finally { setLoading(false); }
  };

  const handleCheckout = async (versionId: string) => {
    if (compareMode) {
      // In compare mode, select version for comparison
      setCompareSelection((prev) => {
        if (prev.includes(versionId)) return prev.filter((id) => id !== versionId);
        if (prev.length >= 2) return [prev[1], versionId];
        return [...prev, versionId];
      });
      return;
    }
    setLoading(true);
    try {
      const res = await apiCheckout(versionId);
      if (res.success) {
        setPreviewData(res.preview);
        setVersions(res.versions);
        setCurrentVersionId(res.currentId);
      }
    } finally { setLoading(false); }
  };

  const handleCompare = async () => {
    if (compareSelection.length !== 2) return;
    setLoadingCompare(true);
    try {
      const data = await compareVersions(compareSelection[0], compareSelection[1]);
      setCompareData(data);
    } catch {
      // ignore
    } finally {
      setLoadingCompare(false);
    }
  };

  const currentIndex = versions.findIndex((v) => v.id === currentVersionId);

  if (versions.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-6 text-center animate-fade-up">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-sunken)", border: "1px solid var(--border)" }}>
          <GitBranch className="w-5 h-5" style={{ color: "var(--text-faint)" }} />
        </div>
        <div>
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>No versions yet</p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-faint)" }}>Each action creates a version you can restore.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b shrink-0 flex-wrap" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <button onClick={handleUndo} disabled={currentIndex <= 0}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-30 disabled:cursor-not-allowed transition btn-ghost">
          <Undo2 className="w-3.5 h-3.5" />Undo
        </button>
        <button onClick={handleRedo} disabled={currentIndex >= versions.length - 1}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-30 disabled:cursor-not-allowed transition btn-ghost">
          <Redo2 className="w-3.5 h-3.5" />Redo
        </button>

        {/* Compare mode toggle */}
        <button
          onClick={() => { setCompareMode((v) => !v); setCompareSelection([]); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition border"
          style={compareMode
            ? { background: "var(--accent-subtle)", borderColor: "var(--accent-border)", color: "var(--accent)" }
            : { background: "transparent", borderColor: "var(--border)", color: "var(--text-faint)" }
          }
        >
          <GitCompare className="w-3.5 h-3.5" />Compare
        </button>

        <div className="ml-auto text-[10px] text-zinc-400 font-mono">
          {currentIndex + 1}/{versions.length}
        </div>
      </div>

      {/* Compare bar */}
      {compareMode && (
        <div className="px-3 py-2 border-b border-pureql-border bg-sky-500/5 shrink-0">
          <div className="text-[9px] text-sky-400 mb-1.5">
            Select 2 versions to compare ({compareSelection.length}/2)
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {compareSelection.length > 0 ? (
              compareSelection.map((id) => {
                const v = versions.find((ver) => ver.id === id);
                return (
                  <span key={id} className="text-[9px] px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/25 text-sky-300 flex items-center gap-1">
                    {v?.label ?? id}
                    <button onClick={() => setCompareSelection((p) => p.filter((x) => x !== id))}>
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                );
              })
            ) : (
              <span className="text-[9px] text-zinc-600">Click version cards below to select</span>
            )}
            {compareSelection.length === 2 && (
              <button
                onClick={handleCompare}
                disabled={loadingCompare}
                className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium bg-sky-500/15 border border-sky-500/30 text-sky-400 hover:bg-sky-500/25 transition disabled:opacity-50"
              >
                {loadingCompare ? (
                  <div className="w-2.5 h-2.5 border border-sky-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <GitCompare className="w-3 h-3" />
                )}
                Compare
              </button>
            )}
          </div>
        </div>
      )}

      {/* Version list */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {[...versions].reverse().map((v, reversedIdx) => {
          const originalIdx = versions.length - 1 - reversedIdx;
          const isActive = v.id === currentVersionId;
          const isFuture = originalIdx > currentIndex;
          const isCompareSelected = compareSelection.includes(v.id);
          const Icon = getIcon(v.label);
          const sqlExpanded = expandedSQL === v.id;

          return (
            <div key={v.id} className="relative">
              {reversedIdx < versions.length - 1 && (
                <div className="absolute left-[22px] top-[42px] bottom-0 w-px bg-pureql-border" />
              )}

              <button
                onClick={() => handleCheckout(v.id)}
                className={`relative w-full flex gap-3 px-2 py-2.5 rounded-lg text-left transition group mb-0.5 ${
                  compareMode && isCompareSelected
                    ? "bg-sky-500/10 border border-sky-500/30"
                    : isActive
                    ? "bg-sky-50 border border-sky-200"
                    : isFuture
                    ? "opacity-40 hover:opacity-70 hover:bg-pureql-panel border border-transparent"
                    : "hover:bg-pureql-panel border border-transparent"
                }`}
              >
                {/* Icon bubble */}
                <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 ${
                  isActive ? "bg-pureql-accent text-white"
                  : compareMode && isCompareSelected ? "bg-sky-500 text-white"
                  : "bg-pureql-panel text-zinc-400 group-hover:text-zinc-600"
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold font-mono ${isActive ? "text-pureql-accent" : "text-zinc-400"}`}>
                      {v.label}
                    </span>
                    {isActive && <CheckCircle2 className="w-3 h-3 text-pureql-accent shrink-0" />}
                    {v.datasetsUsed && v.datasetsUsed.length > 1 && (
                      <span className="flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400">
                        <Layers className="w-2 h-2" />{v.datasetsUsed.length}
                      </span>
                    )}
                  </div>
                  <p className={`text-[11px] font-medium leading-tight mt-0.5 truncate ${isActive ? "text-zinc-700" : "text-zinc-500"}`}>
                    {v.description || v.label}
                  </p>

                  {/* Meta row */}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {v.rowCount != null && (
                      <span className="flex items-center gap-0.5 text-[9px] text-zinc-400">
                        <Database className="w-2.5 h-2.5" />{v.rowCount.toLocaleString()} rows
                      </span>
                    )}
                    {v.storageBytes != null && (
                      <span className="flex items-center gap-0.5 text-[9px] text-zinc-400">
                        <ChevronRight className="w-2.5 h-2.5" />+{formatStorage(v.storageBytes)}
                      </span>
                    )}
                    {v.qualityScore != null && (
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                        v.qualityScore >= 80 ? "bg-emerald-50 text-emerald-600"
                        : v.qualityScore >= 60 ? "bg-amber-50 text-amber-600"
                        : "bg-red-50 text-red-500"
                      }`}>
                        {v.qualityScore}/100
                      </span>
                    )}
                    {v.timestamp && (
                      <span className="flex items-center gap-0.5 text-[9px] text-zinc-400">
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(v.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {/* SQL badge */}
                    {v.sql && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedSQL(sqlExpanded ? null : v.id); }}
                        className={`flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border transition ${
                          sqlExpanded
                            ? "bg-pureql-accent/10 border-pureql-accent/30 text-pureql-accent"
                            : "bg-pureql-panel border-pureql-border text-zinc-500 hover:text-pureql-accent"
                        }`}
                      >
                        <Code2 className="w-2.5 h-2.5" />
                        SQL
                        {sqlExpanded ? <ChevronUp className="w-2 h-2" /> : <ChevronDown className="w-2 h-2" />}
                      </button>
                    )}
                  </div>

                  {/* Expanded SQL */}
                  {sqlExpanded && v.sql && (
                    <div className="mt-2 p-2 bg-pureql-card border border-pureql-border rounded-md" onClick={(e) => e.stopPropagation()}>
                      <div className="text-[9px] font-semibold text-zinc-500 mb-1 flex items-center gap-1">
                        <Code2 className="w-2.5 h-2.5" />Generated SQL
                      </div>
                      <pre className="text-[9px] text-pureql-accent font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-32">
                        {v.sql}
                      </pre>
                    </div>
                  )}

                  {/* Datasets used */}
                  {v.datasetsUsed && v.datasetsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {v.datasetsUsed.map((ds) => (
                        <span key={ds} className="text-[8px] px-1 py-0.5 rounded bg-pureql-panel border border-pureql-border text-zinc-500">
                          {ds}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Compare modal */}
      {compareData && (
        <CompareModal compare={compareData} onClose={() => setCompareData(null)} />
      )}
    </div>
  );
}
