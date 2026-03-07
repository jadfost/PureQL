import { useState, useEffect } from "react";
import { useAppStore } from "../../stores/appStore";
import { detectHardware, getOllamaStatus, updateSettings } from "../../lib/api";
import type { HardwareData, ModelData } from "../../lib/api";
import {
  ShieldCheck, Cpu, Bot, Hexagon, FolderOpen,
  CheckCircle2, AlertCircle, Circle, ChevronLeft, ChevronRight,
} from "lucide-react";

const STEPS = [
  {
    Icon: ShieldCheck,
    title: "Welcome to PureQL",
    desc: "Your data never leaves your machine. Everything runs locally.",
  },
  {
    Icon: Cpu,
    title: "Detecting your hardware...",
    desc: "",
  },
  {
    Icon: Bot,
    title: "Checking AI engine...",
    desc: "",
  },
  {
    Icon: Hexagon,
    title: "Choose your AI model",
    desc: "Based on your hardware, these models will run well:",
  },
  {
    Icon: FolderOpen,
    title: "Ready! Load your first dataset",
    desc: "Drop a CSV, Excel, JSON, or Parquet file to get started.",
  },
];

interface Props {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [hardware, setHardware] = useState<HardwareData | null>(null);
  const [models, setModels] = useState<ModelData[]>([]);
  const [ollamaInstalled, setOllamaInstalled] = useState(false);
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (step === 1) {
      setLoading(true);
      detectHardware()
        .then((res) => {
          setHardware(res.hardware);
          setModels(res.recommendedModels);
          setLoading(false);
          setTimeout(() => setStep(2), 1500);
        })
        .catch(() => {
          setLoading(false);
          setTimeout(() => setStep(2), 1000);
        });
    }
  }, [step]);

  useEffect(() => {
    if (step === 2) {
      setLoading(true);
      getOllamaStatus()
        .then((res) => {
          setOllamaInstalled(res.installed);
          setOllamaRunning(res.running);
          setLoading(false);
          setTimeout(() => setStep(3), 1500);
        })
        .catch(() => {
          setLoading(false);
          setTimeout(() => setStep(3), 1000);
        });
    }
  }, [step]);

  const handleModelSelect = async (modelName: string) => {
    setSelectedModel(modelName);
    await updateSettings({ model: modelName }).catch(() => {});
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const current = STEPS[step];
  const StepIcon = current.Icon;

  return (
    <div className="h-screen bg-pureql-dark flex flex-col">
      {/* Fake title bar */}
      <div className="h-10 border-b border-pureql-border flex items-center px-4">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
        <span className="text-[11px] text-zinc-500 ml-3">PureQL — Setup</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-[10px] text-zinc-600 mb-6">{step + 1}/{STEPS.length}</div>

        <StepIcon
          className="text-pureql-accent w-10 h-10 mb-4"
          strokeWidth={1.5}
        />

        <h2 className="text-xl font-bold text-pureql-accent mb-2">{current.title}</h2>
        {current.desc && (
          <p className="text-xs text-zinc-500 text-center max-w-sm leading-relaxed mb-6">
            {current.desc}
          </p>
        )}

        {/* Step 1: Hardware info */}
        {step === 1 && hardware && (
          <div className="bg-pureql-card border border-pureql-border rounded-lg p-4 w-full max-w-sm mt-4">
            {[
              ["RAM", `${hardware.ramGb} GB`],
              ["CPU", `${hardware.cpuCores} cores`],
              ["GPU", hardware.gpu || "None detected"],
              ["OS", `${hardware.os} (${hardware.arch})`],
              ["Tier", hardware.tier.toUpperCase()],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5 text-[11px] border-b border-pureql-border last:border-0">
                <span className="text-zinc-500">{k}</span>
                <span className="text-pureql-accent font-mono">{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Ollama status */}
        {step === 2 && (
          <div className="bg-pureql-card border border-pureql-border rounded-lg p-4 w-full max-w-sm mt-4">
            <div className="flex items-center gap-2 py-1.5 text-[11px]">
              {ollamaInstalled
                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                : <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              }
              <span className="text-zinc-400">
                Ollama: {ollamaInstalled ? "Installed" : "Not installed"}
              </span>
            </div>
            <div className="flex items-center gap-2 py-1.5 text-[11px]">
              {ollamaRunning
                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                : <Circle className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              }
              <span className="text-zinc-400">
                Server: {ollamaRunning ? "Running" : "Not running"}
              </span>
            </div>
            {!ollamaInstalled && (
              <div className="mt-3 text-[10px] text-zinc-500 bg-pureql-dark p-2 rounded">
                Install Ollama from <span className="text-pureql-accent">ollama.com</span> for local AI.
                You can also use cloud APIs (OpenAI, etc.) instead.
              </div>
            )}
          </div>
        )}

        {/* Step 3: Model selection */}
        {step === 3 && (
          <div className="w-full max-w-sm space-y-2 mt-2">
            {models.slice(0, 5).map((m) => (
              <button
                key={m.name}
                onClick={() => handleModelSelect(m.name)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition ${
                  selectedModel === m.name || (!selectedModel && m.recommended)
                    ? "bg-pureql-accent-dim border-pureql-accent/30"
                    : "bg-pureql-card border-pureql-border hover:border-zinc-400"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-sm font-semibold ${
                    m.recommended ? "text-pureql-accent" : "text-zinc-300"
                  }`}>
                    {m.display_name}
                  </span>
                  <span className="text-[9px] font-bold text-zinc-500 bg-pureql-dark px-2 py-0.5 rounded font-mono">
                    {m.size_gb} GB
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">{m.best_for}</div>
              </button>
            ))}
            <div className="text-[10px] text-zinc-600 text-center mt-2">
              You can also configure cloud API keys later in Settings
            </div>
          </div>
        )}

        {/* Navigation */}
        {!loading && (step === 0 || step === 3 || step === 4) && (
          <div className="flex gap-3 mt-6">
            {step > 0 && step !== 1 && step !== 2 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-4 py-2 text-xs text-zinc-400 border border-pureql-border rounded-md hover:border-zinc-400 transition flex items-center gap-1.5"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-4 py-2 text-xs text-pureql-accent bg-pureql-accent-dim border border-pureql-accent/30 rounded-md hover:bg-pureql-accent/20 transition flex items-center gap-1.5"
            >
              {step === STEPS.length - 1 ? "Get Started" : "Next"}
              {step < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

        {loading && (
          <div className="mt-6 w-24 h-1 bg-pureql-border rounded overflow-hidden">
            <div className="h-full bg-pureql-accent rounded animate-pulse" style={{ width: "70%" }} />
          </div>
        )}
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 pb-6">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step ? "w-4 bg-pureql-accent" : i < step ? "w-1.5 bg-pureql-accent/40" : "w-1.5 bg-zinc-300"
            }`}
          />
        ))}
      </div>
    </div>
  );
}