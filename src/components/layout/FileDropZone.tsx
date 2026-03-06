import { useCallback } from "react";
import { useAppStore } from "../../stores/appStore";

export function FileDropZone() {
  const { setDataset } = useAppStore();

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      // In Tauri, file drops are handled via the Tauri API
      // This is a placeholder for the visual component
    },
    [setDataset]
  );

  const handleBrowse = async () => {
    try {
      // Will use @tauri-apps/plugin-dialog
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Data Files",
            extensions: ["csv", "json", "parquet", "xlsx", "xls", "tsv"],
          },
        ],
      });
      if (selected && typeof selected === "string") {
        const name = selected.split(/[/\\]/).pop() || "dataset";
        setDataset(selected, name);
      }
    } catch {
      // Dialog not available in dev mode without Tauri
      console.log("File dialog requires Tauri runtime");
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={handleBrowse}
        className="w-full max-w-md p-12 border-2 border-dashed border-pureql-border rounded-xl 
                   hover:border-pureql-accent/40 hover:bg-pureql-accent-dim 
                   cursor-pointer transition-all duration-200 text-center"
      >
        <div className="text-4xl mb-4">📄</div>
        <div className="text-sm font-semibold text-zinc-300 mb-2">
          Drop your dataset here
        </div>
        <div className="text-xs text-zinc-500">
          CSV · JSON · Parquet · Excel · TSV
        </div>
        <div className="text-xs text-zinc-600 mt-4">
          or click to browse files
        </div>
        <div className="mt-6 text-[10px] text-pureql-accent/60">
          You can also connect to a database in Settings
        </div>
      </div>
    </div>
  );
}
