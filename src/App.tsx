import { useState, useEffect } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import { OnboardingWizard } from "./components/onboarding/OnboardingWizard";
import { useAppStore } from "./stores/appStore";

function App() {
  const { isFirstLaunch, setFirstLaunch } = useAppStore();

  if (isFirstLaunch) {
    return (
      <OnboardingWizard
        onComplete={() => setFirstLaunch(false)}
      />
    );
  }

  return <AppLayout />;
}

export default App;
