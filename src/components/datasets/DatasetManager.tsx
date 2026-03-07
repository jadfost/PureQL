import { useState, useRef } from "react";
import { useAppStore } from "../../stores/appStore";
import {
  addDataset as apiAddDataset,
  removeDataset as apiRemoveDataset,
  getDatasetPreview,
} from "../../lib/api";
import {
  Database, Trash2, Eye, Plus, Check, Layers,
  ChevronDown, ChevronRight, FileText, AlertCircle,
} from "lucide-react";

export function DatasetManager() {
  const {
    loadedDatasets, addLoadedDataset, removeLoadedDataset,
    selectedDatasets, toggleSelectedDataset, setSelectedDatasets,
    datasetName,
  } = useAppStore();

  const [expandedDataset, setExpandedDataset] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, Record<string, unknown>[]>>({});
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
  const [addingFile, setAddingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleToggleExpand = async (name: string) => {
    if (expandedDataset === name) {
      setExpandedDataset(null);
      return;
    }
    setExpandedDataset(name);
    if (!previewData[name]) {
      setLoadingPreview(name);
      try {
        const res = await getDatasetPreview(name, 10);
        setPreviewData((p) => ({ ...p, [name]: res.preview }));
      } catch {
        // ignore
      } finally {
        setLoadingPreview(null);
      }
    }
  };

  const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setError(null);
    setAddingFile(true);
    for (const file of files) {
      try {
        const res = await apiAddDataset(file);
        addLoadedDataset({
          name: res.name,
          rowCount: res.rowCount,
          colCount: res.colCount,
          qualityScore: res.qualityScore,
          columns: res.columns,
          preview: res.preview?.slice(0, 5) ?? [],
          isActive: false,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add dataset");
      }
    }
    setAddingFile(false);
    e.target.value = "";
  };

  const handleRemove = async (name: string) => {
    try {
      await apiRemoveDataset(name);
    } catch {
      // ignore backend error, still remove from UI
    }
    removeLoadedDataset(name);
    if (expandedDataset === name) setExpandedDataset(null);
    setPreviewData((p) => { const n = { ...p }; delete n[name]; return n; });
  };

  const allSelected = loadedDatasets.length > 0 && loadedDatasets.every((d) => selectedDatasets.includes(d.name));

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedDatasets([]);
    } else {
      setSelectedDatasets(loadedDatasets.map((d) => d.name));
    }
  };

  if (loadedDatasets.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-6 text-center">
        <div className="w-10 h-10 rounded-xl bg-pureql-panel border border-pureql-border flex items-center justify-center">
          <Layers className="w-5 h-5 text-zinc-400" />
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">No datasets loaded</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">
            Drop files in the main area to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-pureql-border shrink-0">
        <button
          onClick={handleSelectAll}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium
                     text-zinc-500 hover:text-zinc-300 hover:bg-pureql-panel transition border border-transparent hover:border-pureql-border"
        >
          <div className={`w-3 h-3 rounded border flex items-center justify-center transition ${
            allSelected ? "bg-pureql-accent border-pureql-accent" : "border-zinc-500"
          }`}>
            {allSelected && <Check className="w-2 h-2 text-white" />}
          </div>
          {allSelected ? "Deselect all" : "Select all"}
        </button>

        <div className="ml-auto flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.json,.parquet,.xlsx,.xls,.tsv,.txt"
            className="hidden"
            onChange={handleAddFile}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={addingFile}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
                       text-pureql-accent bg-pureql-accent-dim border border-pureql-accent/30
                       hover:bg-pureql-accent/20 transition disabled:opacity-50"
          >
            {addingFile ? (
              <div className="w-2.5 h-2.5 border border-pureql-accent border-t-transparent rounded-full animate-spin" />
            ) : (
              <Plus className="w-2.5 h-2.5" />
            )}
            Add
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-2 mt-2 flex items-center gap-1.5 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1.5">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </div>
      )}

      {/* Dataset list */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {loadedDatasets.map((ds) => {
          const isSelected = selectedDatasets.includes(ds.name);
          const isExpanded = expandedDataset === ds.name;
          const isActive = ds.name === datasetName;
          const preview = previewData[ds.name];
          const loading = loadingPreview === ds.name;
          const cols = preview ? Object.keys(preview[0] || {}) : ds.columns;

          return (
            <div key={ds.name}
              className={`rounded-lg border transition overflow-hidden ${
                isSelected
                  ? "border-sky-500/30 bg-sky-500/5"
                  : "border-pureql-border bg-pureql-panel/50"
              }`}
            >
              {/* Header row */}
              <div className="flex items-center gap-2 px-2 py-2">
                {/* Checkbox */}
                <button
                  onClick={() => toggleSelectedDataset(ds.name)}
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                    isSelected ? "bg-sky-500 border-sky-500" : "border-zinc-500 hover:border-zinc-300"
                  }`}
                >
                  {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                </button>

                {/* Icon */}
                <div className="w-6 h-6 rounded-md bg-pureql-card border border-pureql-border flex items-center justify-center shrink-0">
                  <FileText className="w-3 h-3 text-zinc-400" />
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-zinc-300 truncate">{ds.name}</span>
                    {isActive && (
                      <span className="text-[8px] px-1 py-0.5 bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/20 shrink-0">
                        active
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-zinc-500">
                    {ds.rowCount.toLocaleString()} rows · {ds.colCount} cols
                    {ds.qualityScore > 0 && (
                      <span className={`ml-1 font-semibold ${
                        ds.qualityScore >= 80 ? "text-emerald-500" :
                        ds.qualityScore >= 60 ? "text-amber-500" : "text-red-500"
                      }`}>· {ds.qualityScore}/100</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => handleToggleExpand(ds.name)}
                    title="Preview"
                    className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-pureql-card transition"
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => handleRemove(ds.name)}
                    title="Remove"
                    className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Column pills */}
              {!isExpanded && ds.columns.length > 0 && (
                <div className="px-2 pb-2 flex flex-wrap gap-1">
                  {ds.columns.slice(0, 6).map((col) => (
                    <span key={col} className="text-[8px] px-1.5 py-0.5 rounded bg-pureql-card border border-pureql-border text-zinc-500">
                      {col}
                    </span>
                  ))}
                  {ds.columns.length > 6 && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-pureql-card border border-pureql-border text-zinc-600">
                      +{ds.columns.length - 6} more
                    </span>
                  )}
                </div>
              )}

              {/* Expanded preview table */}
              {isExpanded && (
                <div className="border-t border-pureql-border mx-0">
                  {loading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-4 h-4 border border-pureql-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : preview && preview.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[9px]">
                        <thead>
                          <tr className="border-b border-pureql-border bg-pureql-card/50">
                            {cols.slice(0, 6).map((col) => (
                              <th key={col} className="px-2 py-1 text-left font-semibold text-zinc-500 whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                            {cols.length > 6 && (
                              <th className="px-2 py-1 text-left text-zinc-600">+{cols.length - 6}</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-b border-pureql-border/50 hover:bg-pureql-card/30">
                              {cols.slice(0, 6).map((col) => (
                                <td key={col} className="px-2 py-1 text-zinc-400 whitespace-nowrap max-w-[80px] truncate">
                                  {row[col] == null ? (
                                    <span className="text-zinc-600 italic">null</span>
                                  ) : String(row[col])}
                                </td>
                              ))}
                              {cols.length > 6 && <td className="px-2 py-1 text-zinc-600">…</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-3 text-[10px] text-zinc-500">No preview available</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      {loadedDatasets.length > 1 && selectedDatasets.length > 1 && (
        <div className="px-3 py-2 border-t border-pureql-border shrink-0">
          <div className="flex items-center gap-1.5 text-[9px] text-sky-400">
            <Layers className="w-3 h-3" />
            <span>{selectedDatasets.length} datasets selected — ask the AI to join, merge, or compare them</span>
          </div>
        </div>
      )}
    </div>
  );
}
