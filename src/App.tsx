import { AppLayout } from "./components/layout/AppLayout";
import { OnboardingWizard } from "./components/onboarding/OnboardingWizard";
import { ProjectHub } from "./components/project/ProjectHub";
import { useAppStore } from "./stores/appStore";
import { useBridge } from "./hooks/useBridge";
import { Hexagon, AlertTriangle } from "lucide-react";
import type { ProjectLoadResult } from "./lib/api";

function App() {
  const {
    isFirstLaunch, setFirstLaunch,
    hasProject, setHasProject,
    setProjectName, setProjectPath, setProjectCreatedAt,
    setLoadedDatasets, setProfile, setPreviewData, setVersions,
    setCurrentVersionId, setActiveModelInfo, addMessage, clearMessages,
    setDatasetName,
  } = useAppStore();

  const bridge = useBridge();

  if (bridge.checking) {
    return (
      <div className="h-screen bg-pureql-dark flex flex-col items-center justify-center">
        <Hexagon className="text-pureql-accent w-8 h-8 mb-3" strokeWidth={1.5} />
        <div className="text-sm text-zinc-400 mb-2">Starting PureQL engine...</div>
        <div className="w-32 h-1 bg-pureql-border rounded overflow-hidden">
          <div className="h-full bg-pureql-accent rounded animate-pulse" style={{ width: "60%" }} />
        </div>
      </div>
    );
  }

  if (bridge.error) {
    return (
      <div className="h-screen bg-pureql-dark flex flex-col items-center justify-center p-8">
        <AlertTriangle className="text-red-400 w-8 h-8 mb-3" strokeWidth={1.5} />
        <div className="text-sm text-zinc-300 mb-2 font-semibold">Connection Error</div>
        <div className="text-xs text-zinc-500 text-center max-w-md mb-4">{bridge.error}</div>
        <div className="text-xs text-zinc-600 bg-pureql-card border border-pureql-border rounded-md p-3 font-mono">
          python scripts/start_bridge.py
        </div>
      </div>
    );
  }

  if (isFirstLaunch) {
    return <OnboardingWizard onComplete={() => setFirstLaunch(false)} />;
  }

  if (!hasProject) {
    return (
      <ProjectHub
        onOpenApp={(project) => {
          if (project) {
            setProjectName(project.name);
            setProjectPath(project.path || null);
            setProjectCreatedAt(project.createdAt);
            if (project.loadResult) {
              _hydrateStore(project.loadResult, {
                setLoadedDatasets, setProfile, setPreviewData, setVersions,
                setCurrentVersionId, setActiveModelInfo, addMessage, clearMessages,
                setDatasetName,
              });
            }
          }
          setHasProject(true);
        }}
      />
    );
  }

  return <AppLayout />;
}

type HydrateHandles = {
  setLoadedDatasets: (ds: ReturnType<typeof useAppStore>["loadedDatasets"]) => void;
  setProfile: (p: ReturnType<typeof useAppStore>["profile"]) => void;
  setPreviewData: (d: Record<string, unknown>[]) => void;
  setVersions: (v: ReturnType<typeof useAppStore>["versions"]) => void;
  setCurrentVersionId: (id: string | null) => void;
  setActiveModelInfo: (m: ReturnType<typeof useAppStore>["activeModelInfo"]) => void;
  addMessage: ReturnType<typeof useAppStore>["addMessage"];
  clearMessages: () => void;
  setDatasetName: (n: string | null) => void;
};

function _hydrateStore(result: ProjectLoadResult, h: HydrateHandles) {
  if (result.activeDataset) h.setDatasetName(result.activeDataset);
  if (result.datasets?.length) h.setLoadedDatasets(result.datasets);
  if (result.profile) h.setProfile(result.profile);
  if (result.preview?.length) h.setPreviewData(result.preview);
  if (result.versions?.length) h.setVersions(result.versions);
  if (result.currentVersionId) h.setCurrentVersionId(result.currentVersionId);
  if (result.aiModel) {
    h.setActiveModelInfo({
      displayName: result.aiModel,
      modelId: result.aiModel,
      type: result.aiProvider === "ollama" ? "local" : "api",
      provider: result.aiProvider,
    });
  }
  if (result.chatHistory?.length) {
    h.clearMessages();
    result.chatHistory.forEach((m) =>
      h.addMessage({
        id: m.id || String(Math.random()),
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: m.timestamp,
      })
    );
  }
}

export default App;