import { useState } from "react";
import { ChatPanel } from "../chat/ChatPanel";
import { DataPreview } from "../preview/DataPreview";
import { VersionTimeline } from "../timeline/VersionTimeline";
import { FileDropZone } from "./FileDropZone";
import { DatabaseModal } from "../database/DatabaseModal";
import { useAppStore } from "../../stores/appStore";
import { Hexagon, Database } from "lucide-react";

export function AppLayout() {
  const { datasetName, profile, versions } = useAppStore();
  const [showDB, setShowDB] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-pureql-dark">
      {/* Title Bar */}
      <header className="flex items-center px-4 h-10 border-b border-pureql-border bg-pureql-dark shrink-0">
        <div className="flex items-center gap-2">
          <Hexagon className="text-pureql-accent w-4 h-4" strokeWidth={2} />
          <span className="text-xs font-semibold text-zinc-300">PureQL</span>
        </div>
        {datasetName && (
          <span className="text-xs text-zinc-500 ml-3">— {datasetName}</span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {profile && (
            <span className="text-[10px] text-pureql-accent bg-pureql-accent-dim px-2 py-0.5 rounded">
              Score: {profile.qualityScore}/100
            </span>
          )}
          {profile && (
            <span className="text-[10px] text-zinc-500">
              {profile.rowCount.toLocaleString()} rows × {profile.colCount} cols
            </span>
          )}
          <button
            onClick={() => setShowDB(true)}
            className="text-[10px] px-2.5 py-1 rounded border border-pureql-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition flex items-center gap-1.5"
            title="Connect to database"
          >
            <Database className="w-3 h-3" />
            Database
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 border-r border-pureql-border flex flex-col bg-pureql-dark shrink-0">
          <ChatPanel />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          {datasetName ? <DataPreview /> : <FileDropZone />}
        </div>
      </div>

      {/* Version Timeline */}
      {versions.length > 0 && (
        <div className="h-10 border-t border-pureql-border bg-pureql-dark shrink-0">
          <VersionTimeline />
        </div>
      )}

      {/* Database Modal */}
      {showDB && <DatabaseModal onClose={() => setShowDB(false)} />}
    </div>
  );
}