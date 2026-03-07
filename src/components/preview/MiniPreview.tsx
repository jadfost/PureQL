import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { getDatasetPreview } from "../../lib/api";
import { DataTable } from "../shared/DataTable";
import { ChevronDown, BarChart2, Table2, X, RefreshCw } from "lucide-react";

interface MiniPreviewProps {
  slot: 0 | 1;
  onRemove: () => void;
}

export function MiniPreview({ slot, onRemove }: MiniPreviewProps) {
  const { loadedDatasets } = useAppStore();
  const [selectedName, setSelectedName] = useState<string>(loadedDatasets[0]?.name ?? "");
  const [tab, setTab] = useState<"data" | "stats">("data");
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const ds = loadedDatasets.find((d) => d.name === selectedName);

  const loadPreview = async (name: string) => {
    if (!name) return;
    setLoading(true);
    try {
      const res = await getDatasetPreview(name, 100);
      setPreview(res.preview);
    } catch {
      // use stored preview
      const stored = loadedDatasets.find((d) => d.name === name);
      if (stored) setPreview(stored.preview);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (name: string) => {
    setSelectedName(name);
    setDropOpen(false);
    setPreview(null);
    await loadPreview(name);
  };

  // Auto-load on mount
  useState(() => {
    if (selectedName) loadPreview(selectedName);
  });

  const rows = preview ?? ds?.preview ?? [];
  const cols = rows.length > 0 ? Object.keys(rows[0]) : (ds?.columns ?? []);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white border border-[var(--border)] rounded-xl"
         style={{ boxShadow: "var(--shadow-sm)" }}>
      {/* Mini toolbar */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-[var(--border)] shrink-0 bg-[var(--bg)]">
        {/* Dataset selector */}
        <div className="relative">
          <button
            onClick={() => setDropOpen((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-medium text-[var(--text-secondary)] 
                       bg-white border border-[var(--border)] rounded-lg px-2 py-1 hover:border-[var(--accent-border)] transition max-w-[160px]"
          >
            <span className="truncate">{selectedName || "Select dataset…"}</span>
            <ChevronDown className="w-2.5 h-2.5 shrink-0 text-[var(--text-faint)]" />
          </button>
          {dropOpen && (
            <div className="absolute top-full mt-1 left-0 z-30 bg-white border border-[var(--border)] rounded-xl shadow-lg overflow-hidden min-w-[180px]"
                 style={{ boxShadow: "var(--shadow-md)" }}>
              {loadedDatasets.map((d) => (
                <button
                  key={d.name}
                  onClick={() => handleSelect(d.name)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[10px] text-left transition hover:bg-[var(--bg-sunken)] ${
                    d.name === selectedName ? "text-[var(--accent)] font-semibold bg-[var(--accent-subtle)]" : "text-[var(--text-secondary)]"
                  }`}
                >
                  <span className="truncate">{d.name}</span>
                  <span className="ml-auto text-[9px] text-[var(--text-faint)] shrink-0">{d.rowCount?.toLocaleString()} r</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 ml-1">
          {(["data", "stats"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[9px] px-2 py-0.5 rounded-md font-medium transition ${
                tab === t
                  ? "bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent-border)]"
                  : "text-[var(--text-faint)] hover:text-[var(--text-muted)]"
              }`}
            >
              {t === "data" ? <Table2 className="w-3 h-3" /> : <BarChart2 className="w-3 h-3" />}
            </button>
          ))}
        </div>

        {/* Stats badge */}
        {ds && (
          <span className="text-[9px] text-[var(--text-faint)] ml-1 shrink-0">
            {ds.rowCount?.toLocaleString()} × {ds.colCount}
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={() => loadPreview(selectedName)} title="Refresh"
            className="p-1 rounded-md text-[var(--text-faint)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onRemove} title="Close pane"
            className="p-1 rounded-md text-[var(--text-faint)] hover:text-red-500 hover:bg-red-50 transition">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-[var(--text-faint)]">
            <div className="w-4 h-4 border-2 rounded-full border-t-transparent animate-spin"
                 style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
            <span className="text-[11px]">Loading…</span>
          </div>
        ) : tab === "data" ? (
          rows.length > 0 ? (
            <DataTable rows={rows} total={ds?.rowCount} compact showToolbar />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <span className="text-[11px] text-[var(--text-faint)]">Select a dataset to preview</span>
            </div>
          )
        ) : (
          /* Stats mini view */
          ds ? (
            <div className="p-3 space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: "Rows", val: ds.rowCount?.toLocaleString() },
                  { label: "Cols", val: ds.colCount },
                  { label: "Score", val: `${ds.qualityScore}/100` },
                ].map(({ label, val }) => (
                  <div key={label} className="bg-[var(--bg-sunken)] rounded-lg p-2 text-center border border-[var(--border)]">
                    <div className="text-[10px] font-bold text-[var(--text-primary)]">{val}</div>
                    <div className="text-[9px] text-[var(--text-faint)]">{label}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[9px] font-semibold text-[var(--text-faint)] uppercase tracking-wide mb-1.5">Columns</div>
                <div className="flex flex-wrap gap-1">
                  {ds.columns.map((col) => (
                    <span key={col} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] border border-[var(--border)] text-[var(--text-muted)]">
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : <div className="flex items-center justify-center h-full text-[11px] text-[var(--text-faint)]">No dataset selected</div>
        )}
      </div>
    </div>
  );
}
