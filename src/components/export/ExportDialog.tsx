import { FileText, Check } from "lucide-react";
import { useState } from "react";
import { exportData } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";

interface Props {
  onClose: () => void;
}

const FORMATS = [
  {
    id: "csv",
    icon: "file",
    label: "CSV",
    desc: "Universal, works in Excel & any tool",
    ext: ".csv",
  },
  {
    id: "parquet",
    icon: "⚡",
    label: "Parquet",
    desc: "Compressed, fast — ideal for big data",
    ext: ".parquet",
  },
  {
    id: "json",
    icon: "{ }",
    label: "JSON",
    desc: "For APIs and web applications",
    ext: ".json",
  },
  {
    id: "xlsx",
    icon: "📊",
    label: "Excel",
    desc: "For non-technical users",
    ext: ".xlsx",
  },
  {
    id: "sql",
    icon: "🗃",
    label: "SQL Script",
    desc: "CREATE TABLE + INSERT statements",
    ext: ".sql",
  },
  {
    id: "py",
    icon: "🐍",
    label: "Python Pipeline",
    desc: "Reproducible script of all cleaning steps",
    ext: ".py",
  },
];

export function ExportDialog({ onClose }: Props) {
  const { datasetName, profile } = useAppStore();

  const [selectedFormat, setSelectedFormat] = useState("csv");
  const [customPath, setCustomPath] = useState("");
  const [tableName, setTableName] = useState("data");
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fmt = FORMATS.find((f) => f.id === selectedFormat)!;

  // Auto-suggest path from dataset name
  const suggestedPath = (() => {
    if (!datasetName) return `export${fmt.ext}`;
    const base = datasetName.replace(/\.[^.]+$/, "");
    return `${base}_clean${fmt.ext}`;
  })();

  const finalPath = customPath || suggestedPath;

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setResult(null);
    try {
      const res = await exportData(selectedFormat, finalPath, tableName);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[440px] flex flex-col bg-pureql-dark border border-pureql-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-pureql-border">
          <div className="flex items-center gap-2">
            <span>📦</span>
            <span className="text-sm font-semibold text-zinc-200">Export Dataset</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition text-lg">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Dataset info */}
          {profile && (
            <div className="bg-pureql-card border border-pureql-border rounded-md px-3 py-2 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-zinc-300 font-medium">{datasetName}</div>
                <div className="text-[10px] text-zinc-500">
                  {profile.rowCount.toLocaleString()} rows × {profile.colCount} columns
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${
                profile.qualityScore >= 80
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/25"
              }`}>
                {profile.qualityScore}/100
              </span>
            </div>
          )}

          {/* Format selector */}
          <div>
            <div className="text-[10px] font-semibold text-zinc-500 tracking-wide mb-1.5">
              FORMAT
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFormat(f.id)}
                  className={`flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-md border text-left transition ${
                    selectedFormat === f.id
                      ? "border-pureql-accent/50 bg-pureql-accent-dim"
                      : "border-pureql-border hover:border-zinc-500"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{f.icon}</span>
                    <span className={`text-[11px] font-semibold ${
                      selectedFormat === f.id ? "text-pureql-accent" : "text-zinc-300"
                    }`}>
                      {f.label}
                    </span>
                  </div>
                  <span className="text-[9px] text-zinc-600 leading-tight">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Path */}
          <div>
            <div className="text-[10px] font-semibold text-zinc-500 tracking-wide mb-1">
              OUTPUT PATH
            </div>
            <div className="relative">
              <input
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder={suggestedPath}
                className="w-full bg-pureql-dark border border-pureql-border rounded px-2.5 py-1.5 text-[11px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-pureql-accent/50 pr-16 transition"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-mono">
                {fmt.ext}
              </span>
            </div>
          </div>

          {/* Table name for SQL/Python */}
          {(selectedFormat === "sql" || selectedFormat === "py") && (
            <div>
              <div className="text-[10px] font-semibold text-zinc-500 tracking-wide mb-1">
                TABLE NAME
              </div>
              <input
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                className="w-full bg-pureql-dark border border-pureql-border rounded px-2.5 py-1.5 text-[11px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-pureql-accent/50 transition"
                placeholder="data"
              />
            </div>
          )}

          {/* Python pipeline notice */}
          {selectedFormat === "py" && (
            <div className="text-[10px] text-zinc-500 bg-pureql-card border border-pureql-border rounded-md px-3 py-2">
              🐍 Generates a standalone Python script with all cleaning steps.
              Requires <span className="font-mono text-zinc-400">polars</span> + optional sklearn.
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-md px-3 py-2">
              <Check className="w-3 h-3 inline mr-1" />Saved to <span className="font-mono">{result.path}</span>
            </div>
          )}

          {error && (
            <div className="text-[11px] bg-red-500/10 text-red-400 border border-red-500/25 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-pureql-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-4 py-1.5 text-[11px] bg-pureql-accent/20 text-pureql-accent border border-pureql-accent/30 rounded hover:bg-pureql-accent/30 transition disabled:opacity-50"
            >
              {exporting ? "Exporting…" : `Export as ${fmt.label}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}