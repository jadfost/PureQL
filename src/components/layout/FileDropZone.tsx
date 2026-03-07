import { useCallback, useRef, useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { loadDataset, uploadDataset } from "../../lib/api";
import { FileUp, AlertCircle } from "lucide-react";

const ACCEPTED = [".csv", ".json", ".parquet", ".xlsx", ".xls", ".tsv"];
const ACCEPTED_MIME = [
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/tab-separated-values",
  "application/octet-stream", // parquet
];

export function FileDropZone() {
  const { setDatasetName, setProfile, setPreviewData, setVersions, setLoading, isLoading } =
    useAppStore();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const fileInputRef            = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      try {
        // In Tauri production: prefer the native path if available
        const nativePath = (file as any).path as string | undefined;

        const res = nativePath
          ? await loadDataset(nativePath)
          : await uploadDataset(file);

        setDatasetName(res.datasetName);
        setProfile(res.profile);
        setPreviewData(res.preview);
        setVersions(res.versions);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dataset");
      } finally {
        setLoading(false);
      }
    },
    [setDatasetName, setProfile, setPreviewData, setVersions, setLoading]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  const handleClick = async () => {
    // Try Tauri native dialog first (works in production)
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "Data Files", extensions: ["csv", "json", "parquet", "xlsx", "xls", "tsv"] }],
      });
      if (selected && typeof selected === "string") {
        await loadDataset(selected).then((res) => {
          setDatasetName(res.datasetName);
          setProfile(res.profile);
          setPreviewData(res.preview);
          setVersions(res.versions);
        });
        return;
      }
    } catch {
      // Dev mode or Tauri dialog unavailable — fall through to HTML input
    }
    fileInputRef.current?.click();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      {/* Hidden native file input — the real fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={handleInputChange}
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`
          w-full max-w-md p-12 border-2 border-dashed rounded-xl cursor-pointer
          transition-all duration-200 text-center select-none
          ${isLoading ? "pointer-events-none opacity-60" : ""}
          ${dragOver
            ? "border-pureql-accent/60 bg-pureql-accent-dim scale-[1.02]"
            : "border-pureql-border hover:border-pureql-accent/40 hover:bg-pureql-accent-dim"
          }
        `}
      >
        {isLoading ? (
          /* Loading state */
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-pureql-accent border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium text-zinc-400">Loading dataset…</p>
          </div>
        ) : (
          <>
            <FileUp
              className={`mx-auto mb-4 w-10 h-10 transition-colors ${
                dragOver ? "text-pureql-accent" : "text-zinc-400"
              }`}
              strokeWidth={1.5}
            />
            <div className="text-sm font-semibold text-zinc-600 mb-1">
              {dragOver ? "Release to load" : "Drop your dataset here"}
            </div>
            <div className="text-xs text-zinc-400 mb-4">
              CSV · JSON · Parquet · Excel · TSV
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-pureql-accent bg-pureql-accent-dim px-3 py-1.5 rounded-full border border-pureql-accent/20">
              <FileUp className="w-3 h-3" />
              Browse files
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-md">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}