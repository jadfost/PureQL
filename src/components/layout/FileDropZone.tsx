import { useCallback, useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { loadDataset } from "../../lib/api";
import { FileUp } from "lucide-react";

export function FileDropZone() {
  const { setDatasetName, setProfile, setPreviewData, setVersions, setLoading } = useAppStore();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = useCallback(async (filePath: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await loadDataset(filePath);
      setDatasetName(res.datasetName);
      setProfile(res.profile);
      setPreviewData(res.preview);
      setVersions(res.versions);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load dataset");
    } finally {
      setLoading(false);
    }
  }, [setDatasetName, setProfile, setPreviewData, setVersions, setLoading]);

  const handleBrowse = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{
          name: "Data Files",
          extensions: ["csv", "json", "parquet", "xlsx", "xls", "tsv"],
        }],
      });
      if (selected && typeof selected === "string") {
        await handleLoad(selected);
      }
    } catch {
      const path = prompt("Enter file path (Tauri file dialog not available in dev mode):");
      if (path) await handleLoad(path);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = e.dataTransfer.files;
          if (files.length > 0) {
            // @ts-expect-error — Tauri provides path property
            const path = files[0].path || files[0].name;
            handleLoad(path);
          }
        }}
        onClick={handleBrowse}
        className={`w-full max-w-md p-12 border-2 border-dashed rounded-xl cursor-pointer 
                    transition-all duration-200 text-center
                    ${dragOver 
                      ? "border-pureql-accent/60 bg-pureql-accent-dim scale-[1.02]" 
                      : "border-pureql-border hover:border-pureql-accent/40 hover:bg-pureql-accent-dim"
                    }`}
      >
        <FileUp
          className={`mx-auto mb-4 w-10 h-10 transition-colors ${
            dragOver ? "text-pureql-accent" : "text-zinc-400"
          }`}
          strokeWidth={1.5}
        />
        <div className="text-sm font-semibold text-zinc-300 mb-2">
          Drop your dataset here
        </div>
        <div className="text-xs text-zinc-500">
          CSV · JSON · Parquet · Excel · TSV
        </div>
        <div className="text-xs text-zinc-600 mt-4">or click to browse files</div>
      </div>

      {error && (
        <div className="mt-4 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-4 py-2 max-w-md">
          {error}
        </div>
      )}
    </div>
  );
}