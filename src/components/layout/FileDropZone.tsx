import { useCallback, useRef, useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { loadDataset, uploadDataset, addDataset } from "../../lib/api";
import { FileUp, AlertCircle, Plus, Layers } from "lucide-react";

const ACCEPTED = [".csv", ".json", ".parquet", ".xlsx", ".xls", ".tsv", ".txt"];

export function FileDropZone() {
  const {
    setDatasetName, setProfile, setPreviewData, setVersions,
    setLoading, isLoading, addLoadedDataset, loadedDatasets,
  } = useAppStore();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [addingExtra, setAddingExtra] = useState(false);
  const fileInputRef            = useRef<HTMLInputElement>(null);
  const extraInputRef           = useRef<HTMLInputElement>(null);

  const hasPrimary = loadedDatasets.length === 0;

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      try {
        const nativePath = (file as any).path as string | undefined;
        const res = nativePath
          ? await loadDataset(nativePath)
          : await uploadDataset(file);

        setDatasetName(res.datasetName);
        setProfile(res.profile);
        setPreviewData(res.preview);
        setVersions(res.versions);

        // Register as primary dataset
        addLoadedDataset({
          name: res.datasetName,
          rowCount: res.profile.rowCount,
          colCount: res.profile.colCount,
          qualityScore: res.profile.qualityScore,
          columns: res.profile.columns.map((c: any) => c.name).slice(0, 8),
          preview: res.preview.slice(0, 5),
          isActive: true,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dataset");
      } finally {
        setLoading(false);
      }
    },
    [setDatasetName, setProfile, setPreviewData, setVersions, setLoading, addLoadedDataset]
  );

  const handleExtraFile = useCallback(
    async (file: File) => {
      setError(null);
      setAddingExtra(true);
      try {
        const res = await addDataset(file);
        addLoadedDataset({
          name: res.name,
          rowCount: res.rowCount,
          colCount: res.colCount,
          qualityScore: res.qualityScore,
          columns: res.columns,
          preview: res.preview.slice(0, 5),
          isActive: false,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add dataset");
      } finally {
        setAddingExtra(false);
      }
    },
    [addLoadedDataset]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      if (hasPrimary) {
        await handleFile(files[0]);
        for (let i = 1; i < files.length; i++) {
          await handleExtraFile(files[i]);
        }
      } else {
        for (const file of files) {
          await handleExtraFile(file);
        }
      }
    },
    [handleFile, handleExtraFile, hasPrimary]
  );

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await handleFile(files[0]);
    for (let i = 1; i < files.length; i++) {
      await handleExtraFile(files[i]);
    }
    e.target.value = "";
  };

  const handleExtraInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await handleExtraFile(file);
    }
    e.target.value = "";
  };

  const handleClick = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: [{ name: "Data Files", extensions: ["csv", "json", "parquet", "xlsx", "xls", "tsv", "txt"] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      if (hasPrimary && paths.length > 0) {
        const res = await loadDataset(paths[0]);
        setDatasetName(res.datasetName);
        setProfile(res.profile);
        setPreviewData(res.preview);
        setVersions(res.versions);
        addLoadedDataset({
          name: res.datasetName,
          rowCount: res.profile.rowCount,
          colCount: res.profile.colCount,
          qualityScore: res.profile.qualityScore,
          columns: res.profile.columns.map((c: any) => c.name).slice(0, 8),
          preview: res.preview.slice(0, 5),
          isActive: true,
        });
      }
      return;
    } catch {
      // fall through to HTML input
    }
    fileInputRef.current?.click();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 onboarding-bg relative">
      <input ref={fileInputRef} type="file" accept={ACCEPTED.join(",")} multiple className="hidden" onChange={handleInputChange} />
      <input ref={extraInputRef} type="file" accept={ACCEPTED.join(",")} multiple className="hidden" onChange={handleExtraInputChange} />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`w-full max-w-md p-12 rounded-2xl cursor-pointer transition-all duration-300 text-center select-none relative z-10 card ${isLoading ? "pointer-events-none opacity-60" : ""}`}
        style={{
          border: dragOver ? "2px dashed var(--accent)" : "2px dashed var(--border)",
          background: dragOver ? "var(--accent-subtle)" : "white",
          transform: dragOver ? "scale(1.02)" : "scale(1)",
          boxShadow: dragOver ? "var(--accent-glow-md)" : "var(--shadow-card)",
        }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-pureql-accent border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium text-zinc-400">Loading dataset…</p>
          </div>
        ) : (
          <>
            <FileUp
              className="mx-auto mb-4 w-10 h-10 transition-all duration-300"
              style={{ color: dragOver ? "var(--accent)" : "var(--text-ghost)", filter: dragOver ? "var(--accent-glow-sm)" : "none" }}
              strokeWidth={1.5}
            />
            <div className="text-sm font-bold mb-1 transition-colors duration-300" style={{ color: dragOver ? "var(--accent)" : "var(--text-primary)" }}>
              {dragOver ? "Release to load" : "Drop your dataset here"}
            </div>
            <div className="text-xs mb-1" style={{ color: "var(--text-faint)" }}>
              CSV · JSON · Parquet · Excel · TSV · TXT
            </div>
            <div className="text-[10px] mb-4" style={{ color: "var(--text-faint)" }}>
              You can drop multiple files at once
            </div>
            <div className="btn-primary text-xs px-4 py-2 inline-flex">
              <FileUp className="w-3 h-3" />
              Browse files
            </div>
          </>
        )}
      </div>

      {/* Add extra dataset button (shown when at least one dataset is loaded) */}
      {loadedDatasets.length > 0 && (
        <button
          onClick={() => extraInputRef.current?.click()}
          disabled={addingExtra}
          className="mt-3 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-dashed
                     border-pureql-border text-zinc-500 hover:border-pureql-accent/40 hover:text-zinc-300
                     transition disabled:opacity-50"
        >
          {addingExtra ? (
            <div className="w-3 h-3 border border-pureql-accent border-t-transparent rounded-full animate-spin" />
          ) : (
            <Plus className="w-3 h-3" />
          )}
          Add another dataset
          {loadedDatasets.length > 0 && (
            <span className="flex items-center gap-0.5 text-[9px] text-pureql-accent">
              <Layers className="w-2.5 h-2.5" />{loadedDatasets.length} loaded
            </span>
          )}
        </button>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-md">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
