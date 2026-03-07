import { useState } from "react";
import { ChatPanel } from "../chat/ChatPanel";
import { DataPreview } from "../preview/DataPreview";
import { VersionPanel } from "../versions/VersionPanel";
import { ModelsPanel } from "../models/ModelsPanel";
import { FileDropZone } from "./FileDropZone";
import { DatabaseModal } from "../database/DatabaseModal";
import { useAppStore } from "../../stores/appStore";
import {
  Hexagon,
  Database,
  GitBranch,
  Cpu,
  ChevronRight,
  ChevronLeft,
  Zap,
} from "lucide-react";

type RightPanel = "versions" | "models" | null;

export function AppLayout() {
  const { datasetName, profile, versions, activeModelInfo } = useAppStore();
  const [showDB, setShowDB] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);

  const togglePanel = (panel: RightPanel) => {
    setRightPanel((prev) => (prev === panel ? null : panel));
  };

  const PANEL_TITLES: Record<NonNullable<RightPanel>, string> = {
    versions: "Versions",
    models: "AI Models",
  };

  return (
    <div className="flex flex-col h-screen bg-pureql-dark">
      {/* ── Title Bar ── */}
      <header className="flex items-center px-4 h-10 border-b border-pureql-border bg-pureql-dark shrink-0">
        <div className="flex items-center gap-2">
          <Hexagon className="text-pureql-accent w-4 h-4" strokeWidth={2} />
          <span className="text-xs font-semibold text-zinc-700">PureQL</span>
        </div>

        {/* Active model indicator */}
        {activeModelInfo && (
          <button
            onClick={() => togglePanel("models")}
            title="Change AI model"
            className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full border border-pureql-border bg-pureql-panel hover:border-zinc-400 transition group"
          >
            <Zap className={`w-2.5 h-2.5 ${
              activeModelInfo.type === "api"
                ? (activeModelInfo.providerColor ?? "text-zinc-400")
                : "text-pureql-accent"
            }`} />
            <span className="text-[10px] font-medium text-zinc-500 group-hover:text-zinc-700 transition">
              {activeModelInfo.type === "api" && activeModelInfo.provider
                ? `${activeModelInfo.provider} · ${activeModelInfo.displayName}`
                : activeModelInfo.displayName}
            </span>
            <span className={`text-[9px] px-1 py-0.5 rounded font-semibold ${
              activeModelInfo.type === "local"
                ? "bg-emerald-50 text-emerald-600"
                : "bg-amber-50 text-amber-600"
            }`}>
              {activeModelInfo.type === "local" ? "local" : "cloud"}
            </span>
          </button>
        )}

        {datasetName && (
          <span className="text-xs text-zinc-400 ml-3">— {datasetName}</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {profile && (
            <span className="text-[10px] text-pureql-accent bg-pureql-accent-dim px-2 py-0.5 rounded font-semibold">
              Score: {profile.qualityScore}/100
            </span>
          )}
          {profile && (
            <span className="text-[10px] text-zinc-400">
              {profile.rowCount.toLocaleString()} rows × {profile.colCount} cols
            </span>
          )}

          {/* DB button */}
          <button
            onClick={() => setShowDB(true)}
            className="text-[10px] px-2.5 py-1 rounded border border-pureql-border text-zinc-500 hover:text-zinc-700 hover:border-zinc-400 transition flex items-center gap-1.5"
            title="Connect to database"
          >
            <Database className="w-3 h-3" />
            Database
          </button>

          {/* Separator */}
          <div className="w-px h-4 bg-pureql-border" />

          {/* Versions toggle */}
          <button
            onClick={() => togglePanel("versions")}
            title="Version history"
            className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded border transition font-medium ${
              rightPanel === "versions"
                ? "bg-pureql-accent-dim border-pureql-accent/30 text-pureql-accent"
                : "border-pureql-border text-zinc-500 hover:text-zinc-700 hover:border-zinc-400"
            }`}
          >
            <GitBranch className="w-3 h-3" />
            Versions
            {versions.length > 0 && (
              <span
                className={`text-[9px] px-1 rounded font-bold ${
                  rightPanel === "versions"
                    ? "bg-pureql-accent text-white"
                    : "bg-pureql-panel text-zinc-500"
                }`}
              >
                {versions.length}
              </span>
            )}
          </button>

          {/* Models toggle */}
          <button
            onClick={() => togglePanel("models")}
            title="AI Models"
            className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded border transition font-medium ${
              rightPanel === "models"
                ? "bg-pureql-accent-dim border-pureql-accent/30 text-pureql-accent"
                : "border-pureql-border text-zinc-500 hover:text-zinc-700 hover:border-zinc-400"
            }`}
          >
            <Cpu className="w-3 h-3" />
            Models
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Chat */}
        <div className="w-64 border-r border-pureql-border flex flex-col bg-pureql-dark shrink-0">
          <ChatPanel />
        </div>

        {/* Center: Data preview / drop zone */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {datasetName ? <DataPreview /> : <FileDropZone />}
        </div>

        {/* Right: Sliding panel */}
        {rightPanel && (
          <div className="w-72 border-l border-pureql-border flex flex-col bg-pureql-dark shrink-0 overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center px-3 h-9 border-b border-pureql-border shrink-0">
              <span className="text-[11px] font-semibold text-zinc-600">
                {PANEL_TITLES[rightPanel]}
              </span>
              <button
                onClick={() => setRightPanel(null)}
                className="ml-auto text-zinc-400 hover:text-zinc-600 transition p-0.5 rounded"
                title="Close panel"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-hidden">
              {rightPanel === "versions" && <VersionPanel />}
              {rightPanel === "models" && <ModelsPanel />}
            </div>
          </div>
        )}

        {/* Collapsed state: thin edge with open hint */}
        {!rightPanel && (
          <div className="flex flex-col items-center justify-center w-5 border-l border-pureql-border bg-pureql-dark shrink-0">
            <button
              onClick={() => togglePanel("versions")}
              title="Open sidebar"
              className="text-zinc-300 hover:text-pureql-accent transition p-0.5"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* ── Database Modal ── */}
      {showDB && <DatabaseModal onClose={() => setShowDB(false)} />}
    </div>
  );
}