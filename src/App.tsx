import { useEffect, useState } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import { OnboardingWizard } from "./components/onboarding/OnboardingWizard";
import { ProjectHub } from "./components/project/ProjectHub";
import { useAppStore } from "./stores/appStore";
import { useBridge } from "./hooks/useBridge";
import { getOllamaStatus } from "./lib/api";
import { Hexagon, AlertTriangle } from "lucide-react";
import type { ProjectLoadResult } from "./lib/api";

/** Key stored in localStorage once the user completes the wizard at least once */
const SETUP_DONE_KEY = "pureql_setup_complete";

/**
 * Returns true when we MUST show the OnboardingWizard.
 * - First ever launch  (localStorage key missing)
 * - OR Ollama is not installed at all (critical dependency)
 */
async function shouldForceOnboarding(): Promise<{ force: boolean; reason: "first_launch" | "no_ollama" | null }> {
  const setupDone = localStorage.getItem(SETUP_DONE_KEY);
  if (!setupDone) {
    return { force: true, reason: "first_launch" };
  }
  // Already set up before — only re-force if Ollama is gone
  try {
    const status = await getOllamaStatus();
    if (!status.installed) {
      return { force: true, reason: "no_ollama" };
    }
  } catch {
    // Can't reach bridge yet — don't block
  }
  return { force: false, reason: null };
}

function App() {
  const {
    showOnboardingWizard, setShowOnboardingWizard,
    setFirstLaunch,
    hasProject, setHasProject,
    setProjectName, setProjectPath, setProjectCreatedAt,
    setLoadedDatasets, setProfile, setPreviewData, setVersions,
    setCurrentVersionId, setActiveModelInfo, addMessage, clearMessages,
    setDatasetName,
  } = useAppStore();

  const bridge = useBridge();

  const [setupChecked, setSetupChecked] = useState(false);

  // Once the bridge is ready, evaluate whether we need to show the wizard
  useEffect(() => {
    if (bridge.checking || bridge.error) return;

    shouldForceOnboarding().then(({ force, reason }) => {
      if (force) {
        setShowOnboardingWizard(true);
        setFirstLaunch(reason === "first_launch");
      } else {
        setShowOnboardingWizard(false);
        setFirstLaunch(false);
      }
      setSetupChecked(true);
    });
  }, [bridge.checking, bridge.error]);

  /** Called when the user finishes the wizard */
  const handleWizardComplete = () => {
    localStorage.setItem(SETUP_DONE_KEY, "1");
    setShowOnboardingWizard(false);
    setFirstLaunch(false);
  };

  /** Called from ProjectHub to re-open the wizard manually */
  const handleOpenSetup = () => {
    setShowOnboardingWizard(true);
  };

  // ── Loading: bridge still connecting ──────────────────────────────────────
  if (bridge.checking || (!bridge.error && !setupChecked)) {
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

  // ── Error: bridge failed ───────────────────────────────────────────────────
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

  // ── Onboarding wizard (first launch OR Ollama missing) ────────────────────
  if (showOnboardingWizard) {
    return <OnboardingWizard onComplete={handleWizardComplete} />;
  }

  // ── Project hub (no active project) ───────────────────────────────────────
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
        onOpenSetup={handleOpenSetup}
      />
    );
  }

  // ── Main app ───────────────────────────────────────────────────────────────
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