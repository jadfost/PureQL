import { useState } from "react";
import { exportAndDownload } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import {
  Download, X, CheckCircle2, AlertCircle,
  FileText, Zap, Braces, Table, Database, Code,
} from "lucide-react";

interface Props { onClose: () => void; }

const FORMATS = [
  { id: "csv",     Icon: FileText,  label: "CSV",             desc: "Universal — works everywhere",       ext: ".csv",     color: "text-emerald-500", bg: "bg-emerald-50 border-emerald-200" },
  { id: "parquet", Icon: Zap,       label: "Parquet",         desc: "Compressed, fast — ideal for pipelines", ext: ".parquet", color: "text-sky-500",     bg: "bg-sky-50 border-sky-200"     },
  { id: "json",    Icon: Braces,    label: "JSON",            desc: "For APIs and web applications",      ext: ".json",    color: "text-amber-500",   bg: "bg-amber-50 border-amber-200" },
  { id: "xlsx",    Icon: Table,     label: "Excel",           desc: "For non-technical stakeholders",     ext: ".xlsx",    color: "text-green-600",   bg: "bg-green-50 border-green-200" },
  { id: "sql",     Icon: Database,  label: "SQL Script",      desc: "CREATE TABLE + INSERT statements",   ext: ".sql",     color: "text-purple-500",  bg: "bg-purple-50 border-purple-200"},
  { id: "py",      Icon: Code,      label: "Python Pipeline", desc: "Reproducible script of all steps",   ext: ".py",      color: "text-blue-500",    bg: "bg-blue-50 border-blue-200"   },
];

export function ExportDialog({ onClose }: Props) {
  const { datasetName, profile } = useAppStore();

  const [format, setFormat]       = useState("csv");
  const [tableName, setTableName] = useState("data");
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fmt = FORMATS.find((f) => f.id === format)!;

  const suggestedFilename = (() => {
    const base = (datasetName ?? "export").replace(/\.[^.]+$/, "");
    return `${base}_clean${fmt.ext}`;
  })();

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    setDone(false);
    try {
      await exportAndDownload(format, suggestedFilename, tableName);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-[480px] flex flex-col bg-white border border-pureql-border rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-pureql-border">
          <div>
            <h2 className="text-sm font-bold text-zinc-800">Export Dataset</h2>
            {profile && (
              <p className="text-[10px] text-zinc-400 mt-0.5">
                {profile.rowCount.toLocaleString()} rows · {profile.colCount} cols · Score {profile.qualityScore}/100
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format grid */}
        <div className="p-5 space-y-4">
          <div>
            <p className="text-[10px] font-semibold text-zinc-400 tracking-widest uppercase mb-2">Format</p>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map(({ id, Icon, label, desc, color, bg }) => {
                const isActive = format === id;
                return (
                  <button key={id} onClick={() => { setFormat(id); setDone(false); setError(null); }}
                    className={`flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition ${
                      isActive ? `${bg} border-current` : "border-pureql-border hover:border-zinc-300 hover:bg-pureql-panel"
                    }`}>
                    <Icon className={`w-4 h-4 ${isActive ? color : "text-zinc-400"}`} />
                    <div>
                      <div className={`text-[11px] font-semibold ${isActive ? "text-zinc-800" : "text-zinc-600"}`}>{label}</div>
                      <div className="text-[9px] text-zinc-400 leading-tight mt-0.5">{desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table name — only for SQL / Python */}
          {(format === "sql" || format === "py") && (
            <div>
              <label className="text-[10px] font-semibold text-zinc-400 tracking-widest uppercase mb-1.5 block">
                Table / dataset name
              </label>
              <input
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="data"
                className="w-full text-[12px] px-3 py-2 rounded-lg border border-pureql-border bg-pureql-panel focus:outline-none focus:border-pureql-accent focus:ring-1 focus:ring-pureql-accent/20"
              />
            </div>
          )}

          {/* Python note */}
          {format === "py" && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200">
              <Code className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-blue-700 leading-snug">
                Generates a standalone script with all cleaning steps. Requires <code className="font-mono">polars</code> + optional <code className="font-mono">scikit-learn</code>.
              </p>
            </div>
          )}

          {/* Output filename preview */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pureql-panel border border-pureql-border">
            <fmt.Icon className={`w-3.5 h-3.5 shrink-0 ${fmt.color}`} />
            <span className="text-[11px] font-mono text-zinc-600 flex-1 truncate">{suggestedFilename}</span>
            <span className="text-[9px] text-zinc-400 shrink-0">will be downloaded</span>
          </div>

          {/* Status */}
          {done && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-[11px] text-emerald-700 font-medium">
                <strong>{suggestedFilename}</strong> downloaded successfully!
              </span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-[11px] text-red-600">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-pureql-border bg-pureql-panel">
          <button onClick={onClose} className="px-4 py-2 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 transition">
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button onClick={handleExport} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-pureql-accent text-white text-[11px] font-semibold hover:bg-sky-600 disabled:opacity-50 transition">
              {loading
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Exporting…</>
                : <><Download className="w-3.5 h-3.5" /> Download {fmt.label}</>}
            </button>
          )}
          {done && (
            <button onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-pureql-panel text-zinc-600 border border-pureql-border text-[11px] font-semibold hover:bg-zinc-200 transition">
              <Download className="w-3.5 h-3.5" /> Download again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}