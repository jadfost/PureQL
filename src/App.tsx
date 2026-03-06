import { AppLayout } from "./components/layout/AppLayout";
import { OnboardingWizard } from "./components/onboarding/OnboardingWizard";
import { useAppStore } from "./stores/appStore";
import { useBridge } from "./hooks/useBridge";

function App() {
  const { isFirstLaunch, setFirstLaunch } = useAppStore();
  const bridge = useBridge();

  if (bridge.checking) {
    return (
      <div className="h-screen bg-pureql-dark flex flex-col items-center justify-center">
        <span className="text-pureql-accent text-2xl font-bold mb-3">⬡</span>
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
        <span className="text-red-400 text-2xl mb-3">⚠</span>
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

  return <AppLayout />;
}

export default App;
