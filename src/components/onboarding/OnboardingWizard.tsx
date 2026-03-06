import { useState } from "react";
import { useAppStore } from "../../stores/appStore";

const STEPS = [
  {
    icon: "🔒",
    title: "Welcome to PureQL",
    desc: "Your data never leaves your machine. Everything runs locally. Zero servers, zero telemetry, zero accounts.",
  },
  {
    icon: "🔍",
    title: "Detecting your hardware...",
    desc: "PureQL analyzes your system to recommend the best AI model.",
  },
  {
    icon: "⚙",
    title: "Installing AI engine",
    desc: "PureQL installs Ollama automatically. No action needed from you.",
  },
  {
    icon: "⬡",
    title: "Choose your AI model",
    desc: "Based on your hardware, these free models will run well:",
  },
  {
    icon: "📁",
    title: "Ready! Drop your first dataset",
    desc: "Drag a CSV, Excel, JSON, or Parquet file to get started.",
  },
];

const MODELS = [
  { name: "Qwen 2.5 7B", tag: "RECOMMENDED", size: "4.4 GB", desc: "Best for data & SQL" },
  { name: "Mistral 7B", tag: "FAST", size: "4.1 GB", desc: "Versatile and fast" },
  { name: "Phi-3 Mini 3.8B", tag: "LIGHT", size: "2.3 GB", desc: "Minimal resources" },
];

interface Props {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const { setSelectedModel, setHardware } = useAppStore();

  const handleModelSelect = (modelName: string) => {
    setSelectedModel(modelName);
  };

  const handleNext = () => {
    if (step === 1) {
      // Simulate hardware detection
      setHardware({
        ram: 16,
        cpuCores: 8,
        gpu: "Detected GPU",
        os: navigator.platform,
      });
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const current = STEPS[step];

  return (
    <div className="h-screen bg-pureql-dark flex flex-col">
      {/* Title bar placeholder */}
      <div className="h-10 border-b border-pureql-border flex items-center px-4" data-tauri-drag-region>
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
        </div>
        <span className="text-[11px] text-zinc-500 ml-3">PureQL — Setup</span>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-[10px] text-zinc-600 mb-6">
          {step + 1}/{STEPS.length}
        </div>
        <div className="text-4xl mb-4">{current.icon}</div>
        <h2 className="text-xl font-bold text-pureql-accent mb-2">
          {current.title}
        </h2>
        <p className="text-xs text-zinc-500 text-center max-w-sm leading-relaxed mb-6">
          {current.desc}
        </p>

        {/* Step 3: Model selection */}
        {step === 3 && (
          <div className="w-full max-w-sm space-y-2 mb-6">
            {MODELS.map((m) => (
              <button
                key={m.name}
                onClick={() => handleModelSelect(m.name)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition ${
                  m.tag === "RECOMMENDED"
                    ? "bg-pureql-accent-dim border-pureql-accent/30"
                    : "bg-pureql-card border-pureql-border hover:border-zinc-600"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-sm font-semibold ${
                    m.tag === "RECOMMENDED" ? "text-pureql-accent" : "text-zinc-300"
                  }`}>
                    {m.name}
                  </span>
                  <span className="text-[9px] font-bold text-zinc-500 bg-pureql-dark px-2 py-0.5 rounded">
                    {m.tag}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  {m.desc} · {m.size}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-5 py-2 text-xs text-zinc-400 border border-pureql-border rounded-md hover:border-zinc-600 transition"
            >
              ← Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="px-5 py-2 text-xs text-pureql-accent bg-pureql-accent-dim border border-pureql-accent/30 rounded-md hover:bg-pureql-accent/20 transition"
          >
            {step === STEPS.length - 1 ? "Get Started" : "Next →"}
          </button>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 pb-6">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step ? "w-4 bg-pureql-accent" : "w-1.5 bg-zinc-700"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
