import { useState } from "react";
import { ChatPanel } from "../chat/ChatPanel";
import { DataPreview } from "../preview/DataPreview";
import { VersionTimeline } from "../timeline/VersionTimeline";
import { useAppStore } from "../../stores/appStore";
import { FileDropZone } from "./FileDropZone";

export function AppLayout() {
  const { datasetName, profile } = useAppStore();

  return (
    <div className="flex flex-col h-screen bg-pureql-dark">
      {/* Title Bar */}
      <header
        className="flex items-center px-4 h-10 border-b border-pureql-border bg-pureql-dark shrink-0"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2">
          <span className="text-pureql-accent font-bold text-sm">⬡</span>
          <span className="text-xs font-semibold text-zinc-300">PureQL</span>
        </div>
        {datasetName && (
          <span className="text-xs text-zinc-500 ml-3">
            — {datasetName}
          </span>
        )}
        {profile && (
          <span className="ml-auto text-[10px] text-pureql-accent bg-pureql-accent-dim px-2 py-0.5 rounded">
            Score: {profile.qualityScore}/100
          </span>
        )}
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Panel */}
        <div className="w-72 border-r border-pureql-border flex flex-col bg-pureql-dark shrink-0">
          <ChatPanel />
        </div>

        {/* Data Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {datasetName ? (
            <DataPreview />
          ) : (
            <FileDropZone />
          )}
        </div>
      </div>

      {/* Version Timeline */}
      <div className="h-10 border-t border-pureql-border bg-pureql-dark shrink-0">
        <VersionTimeline />
      </div>
    </div>
  );
}
