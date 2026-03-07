import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../../stores/appStore";
import { detectHardware, getOllamaStatus, startOllama, updateSettings } from "../../lib/api";
import type { HardwareData, ModelData } from "../../lib/api";
import {
  Hexagon, ChevronLeft, ArrowRight, Sparkles,
  CheckCircle2, AlertCircle, Lock, Zap, Layers,
  Download, AlertTriangle, Wifi,
} from "lucide-react";

/* ─── Steps ──────────────────────────────────────────────────────────────── */
// El step "download" se inserta dinámicamente solo si el modelo no está ya instalado
const BASE_STEPS = [
  { id: "welcome",  title: "Pure data.\nPure queries.\nPure local.",  cta: "Get started" },
  { id: "hardware", title: "Reading\nyour machine",                  cta: null },
  { id: "ollama",   title: "Checking\nAI engine",                    cta: null },
  { id: "model",    title: "Choose your\nAI model",                  cta: "Continue" },
  { id: "download", title: "Downloading\nyour model",                cta: null },
  { id: "ready",    title: "You're all\nset!",                        cta: "Open PureQL" },
];

interface Props { onComplete: () => void; }

/* ─── Ollama helpers ─────────────────────────────────────────────────────── */
const OLLAMA_BASE = "http://localhost:11434";

/** Devuelve los nombres de modelos ya instalados en Ollama */
async function getInstalledModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models ?? []).map((m: { name: string }) => m.name.split(":")[0]);
  } catch {
    return [];
  }
}

interface PullProgress {
  status: string;       // "pulling manifest" | "downloading" | "verifying sha256" | "success" | ...
  completed?: number;
  total?: number;
  pct: number;          // 0–100 calculado
  done: boolean;
  error?: string;
}

/**
 * Llama a `POST /api/pull` de Ollama con stream y llama al callback
 * por cada chunk de progreso recibido.
 */
async function pullModelWithProgress(
  modelName: string,
  onProgress: (p: PullProgress) => void
): Promise<void> {
  const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: modelName, stream: true }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama pull failed: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";   // la última línea puede estar incompleta

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        const completed = chunk.completed ?? 0;
        const total     = chunk.total ?? 0;
        const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;
        const isDone    = chunk.status === "success";

        onProgress({
          status: chunk.status ?? "",
          completed,
          total,
          pct: isDone ? 100 : pct,
          done: isDone,
          error: chunk.error,
        });

        if (isDone) return;
      } catch {
        // línea no parseable, ignorar
      }
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/* ─── Fondo ──────────────────────────────────────────────────────────────── */
const ORBS = [
  { size: 340, top: "-80px",  left: "-60px",  opacity: 0.32, duration: "9s",  delay: "0s",   color: "var(--accent)" },
  { size: 260, top: "55%",    right: "-80px", opacity: 0.26, duration: "12s", delay: "2s",   color: "var(--accent2)" },
  { size: 180, bottom: "60px",left: "30%",    opacity: 0.20, duration: "7s",  delay: "1.5s", color: "var(--accent-light)" },
];

function OrbLayer() {
  return (
    <>
      {ORBS.map((orb, i) => (
        <div
          key={i}
          className="onboarding-orb"
          style={{
            width: orb.size, height: orb.size,
            top: orb.top, left: (orb as { left?: string }).left,
            right: (orb as { right?: string }).right,
            bottom: (orb as { bottom?: string }).bottom,
            background: `radial-gradient(circle, ${orb.color}, transparent 65%)`,
            "--orb-opacity": orb.opacity,
            "--orb-duration": orb.duration,
            "--orb-delay": orb.delay,
          } as React.CSSProperties}
        />
      ))}
    </>
  );
}

/* ─── Logo icon ──────────────────────────────────────────────────────────── */
function LogoIcon({ gradient, glow, children }: {
  gradient: string;
  glow: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative mb-8">
      <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{ background: gradient, boxShadow: glow }}>
        {children}
      </div>
      <div className="absolute -inset-3 rounded-3xl -z-10"
        style={{ background: gradient, opacity: 0.12, filter: "blur(16px)" }} />
    </div>
  );
}

/* ─── Steps ──────────────────────────────────────────────────────────────── */
function WelcomeStep() {
  return (
    <div className="flex flex-col items-center text-center animate-fade-up">
      <LogoIcon gradient="var(--gradient-accent)" glow="var(--accent-glow-md)">
        <Hexagon className="w-10 h-10 text-white" strokeWidth={1.5} />
      </LogoIcon>
      <div className="flex gap-2 mb-8 flex-wrap justify-center">
        {[{ icon: Lock, label: "100% Local" }, { icon: Zap, label: "Blazing fast" }, { icon: Layers, label: "Open source" }]
          .map(({ icon: Icon, label }) => (
            <div key={label} className="pill"><Icon className="w-3 h-3" />{label}</div>
          ))}
      </div>
      <p className="text-sm leading-relaxed max-w-xs" style={{ color: "var(--text-muted)" }}>
        Clean messy datasets and optimize SQL queries — AI that runs entirely on your machine.{" "}
        <span style={{ color: "var(--accent)", fontWeight: 500 }}>Your data never leaves.</span>
      </p>
    </div>
  );
}

function HardwareStep({ hardware, loading }: { hardware: HardwareData | null; loading: boolean }) {
  const rows = hardware ? [
    { label: "RAM",  value: `${hardware.ramGb} GB`,                     ok: hardware.ramGb >= 8 },
    { label: "CPU",  value: `${hardware.cpuCores} cores`,               ok: hardware.cpuCores >= 4 },
    { label: "GPU",  value: hardware.gpu ?? "Not detected",             ok: !!hardware.gpu },
    { label: "OS",   value: `${hardware.os} · ${hardware.arch ?? ""}`, ok: true },
    { label: "Tier", value: hardware.tier?.toUpperCase() ?? "—",        ok: true },
  ] : [];

  return (
    <div className="w-full max-w-xs animate-fade-up">
      <div className="card overflow-hidden">
        {loading
          ? <div className="p-6 space-y-4">{[75,55,85,65,45].map((w,i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-2.5 rounded-full animate-pulse" style={{ width: 32, background: "var(--bg-sunken)" }} />
                <div className="h-2.5 rounded-full animate-pulse" style={{ width: `${w}%`, background: "var(--bg-sunken)" }} />
              </div>))}
            </div>
          : rows.map(({ label, value, ok }, i) => (
              <div key={label} className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
                <span className="text-xs w-10" style={{ color: "var(--text-faint)" }}>{label}</span>
                <span className="text-xs font-mono flex-1 text-right mr-3" style={{ color: "var(--text-primary)" }}>{value}</span>
                {ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--success)" }} />
                    : <AlertCircle  className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--warning)" }} />}
              </div>
            ))
        }
      </div>
    </div>
  );
}

function OllamaStep({
  installed, running, loading, starting, startError, onRetry,
}: {
  installed: boolean;
  running: boolean;
  loading: boolean;
  starting: boolean;
  startError: string | null;
  onRetry: () => void;
}) {
  const rows = [
    { label: "Ollama binary", sublabel: "CLI tool",     ok: installed, pending: loading },
    { label: "Local server",  sublabel: "ollama serve", ok: running,   pending: loading || starting },
  ];

  return (
    <div className="w-full max-w-xs animate-fade-up">
      <div className="card overflow-hidden">
        {rows.map(({ label, sublabel, ok, pending }, i) => (
          <div
            key={label}
            className="flex items-center gap-3 px-5 py-4"
            style={{ borderBottom: i === 0 ? "1px solid var(--border)" : "none" }}>
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background: pending ? "var(--border-strong)" : ok ? "var(--success)" : "var(--danger)",
                animation: pending ? "pulse 1.5s ease-in-out infinite" : "none",
                boxShadow: pending ? "none" : ok
                  ? "0 0 6px rgba(16,185,129,0.5)"
                  : "0 0 6px rgba(239,68,68,0.5)",
              }}
            />
            <div className="flex-1">
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</div>
              <div className="text-[10px] font-mono" style={{ color: "var(--text-ghost)" }}>{sublabel}</div>
            </div>
            {!pending && (
              <span className="text-xs font-medium" style={{ color: ok ? "var(--success)" : "var(--danger)" }}>
                {ok ? "Ready" : "Missing"}
              </span>
            )}
            {pending && (
              <span className="text-xs" style={{ color: "var(--text-ghost)" }}>
                {starting && i === 1 ? "Starting…" : "Checking…"}
              </span>
            )}
          </div>
        ))}
      </div>

      {!loading && installed && !running && !starting && !startError && (
        <div className="mt-3 flex items-center gap-2 px-1">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>Starting Ollama automatically…</p>
        </div>
      )}

      {starting && (
        <div className="mt-3 flex items-center gap-2 px-1">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Running <code className="font-mono text-[10px]">ollama serve</code>…
          </p>
        </div>
      )}

      {startError && (
        <div className="mt-3 p-3 rounded-xl"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)" }}>
          <p className="text-xs mb-2" style={{ color: "var(--danger)" }}>{startError}</p>
          <button onClick={onRetry} className="text-xs font-medium underline underline-offset-2"
            style={{ color: "var(--accent)" }}>
            Try again
          </button>
        </div>
      )}

      {!loading && !installed && (
        <p className="mt-4 text-center text-xs leading-relaxed" style={{ color: "var(--text-faint)" }}>
          Install from{" "}
          <span style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" }}>
            ollama.com
          </span>
          {" "}or use a cloud API key in Settings.
        </p>
      )}
    </div>
  );
}

function ModelStep({ models, selected, onSelect }: {
  models: ModelData[];
  selected: string | null;
  onSelect: (n: string) => void;
}) {
  return (
    <div className="w-full max-w-sm space-y-2 animate-fade-up">
      {models.slice(0, 5).map((m) => {
        const isActive = selected === m.name || (!selected && m.recommended);
        return (
          <button key={m.name} onClick={() => onSelect(m.name)}
            className="w-full text-left px-4 py-3.5 rounded-xl transition-all duration-200"
            style={{
              border: `1px solid ${isActive ? "var(--accent-border)" : "var(--border)"}`,
              background: isActive ? "var(--accent-muted)" : "var(--bg-raised)",
              boxShadow: isActive ? "0 0 0 3px rgba(14,165,233,0.07), var(--shadow-card)" : "var(--shadow-xs)",
            }}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: isActive ? "var(--accent-dark)" : "var(--text-primary)" }}>
                  {m.display_name}
                </span>
                {m.recommended && (
                  <span className="badge-accent"><Sparkles className="w-2.5 h-2.5" />RECOMMENDED</span>
                )}
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md shrink-0"
                style={{ background: "var(--bg-sunken)", color: "var(--text-faint)", border: "1px solid var(--border)" }}>
                {m.size_gb} GB
              </span>
            </div>
            <span className="text-xs" style={{ color: "var(--text-faint)" }}>{m.best_for}</span>
          </button>
        );
      })}
      <p className="text-center text-xs pt-1" style={{ color: "var(--text-ghost)" }}>
        Cloud API keys can be configured later in Settings
      </p>
    </div>
  );
}

/* ─── Download step ──────────────────────────────────────────────────────── */
function DownloadStep({ modelName, onDone }: { modelName: string; onDone: () => void }) {
  const [progress, setProgress] = useState<PullProgress>({
    status: "Starting download...", pct: 0, done: false,
  });
  const [error, setError]       = useState<string | null>(null);
  const [speed, setSpeed]       = useState<number>(0);   // bytes/sec
  const [eta, setEta]           = useState<number | null>(null); // seconds remaining
  const started    = useRef(false);
  const lastBytes  = useRef(0);
  const lastTime   = useRef(Date.now());

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    pullModelWithProgress(modelName, (p) => {
      // Calculate speed & ETA from byte deltas
      if ((p.completed ?? 0) > 0 && (p.total ?? 0) > 0) {
        const now      = Date.now();
        const dt       = (now - lastTime.current) / 1000;
        const db       = (p.completed ?? 0) - lastBytes.current;
        if (dt > 0.5 && db > 0) {
          const bps = db / dt;
          setSpeed(bps);
          const remaining = (p.total ?? 0) - (p.completed ?? 0);
          setEta(bps > 0 ? Math.round(remaining / bps) : null);
          lastBytes.current = p.completed ?? 0;
          lastTime.current  = now;
        }
      }
      setProgress(p);
      if (p.done) setTimeout(onDone, 900);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Download failed");
    });
  }, [modelName, onDone]);

  const statusLabel: Record<string, string> = {
    "pulling manifest":             "Fetching manifest…",
    "downloading":                  "Downloading weights…",
    "verifying sha256":             "Verifying integrity…",
    "writing manifest":             "Writing manifest…",
    "removing any unused layers":   "Cleaning up…",
    "success":                      "Model ready!",
  };
  const friendlyStatus = statusLabel[progress.status] ?? progress.status;

  const formatEta = (sec: number) => {
    if (sec < 60)  return `${sec}s left`;
    if (sec < 3600) return `${Math.round(sec / 60)}m left`;
    return `${(sec / 3600).toFixed(1)}h left`;
  };
  const formatSpeed = (bps: number) => {
    if (bps < 1024)       return `${bps.toFixed(0)} B/s`;
    if (bps < 1024**2)    return `${(bps/1024).toFixed(1)} KB/s`;
    return `${(bps/1024**2).toFixed(1)} MB/s`;
  };

  const isDownloading = progress.status === "downloading" && !progress.done;

  return (
    <div className="w-full max-w-md animate-fade-up">
      <div className="card p-7">

        {/* Model identity */}
        <div className="flex items-center gap-4 mb-7">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 relative"
            style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}>
            {progress.done
              ? <CheckCircle2 className="w-6 h-6" style={{ color: "var(--success)" }} />
              : <Download className="w-6 h-6" style={{ color: "var(--accent)", animation: "bounce 1.4s ease-in-out infinite" }} />
            }
            {/* Pulsing ring while downloading */}
            {!progress.done && (
              <span className="absolute inset-0 rounded-2xl animate-ping opacity-20"
                style={{ background: "var(--accent)" }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold truncate" style={{ color: "var(--text-primary)" }}>
              {modelName}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs" style={{ color: "var(--text-faint)" }}>via Ollama</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
                LOCAL ONLY
              </span>
            </div>
          </div>
          {/* Percentage badge */}
          <div className="shrink-0 text-right">
            <span className="text-2xl font-black font-mono tabular-nums"
              style={{ color: progress.done ? "var(--success)" : "var(--accent)" }}>
              {progress.done ? "100" : progress.pct}
            </span>
            <span className="text-sm font-bold" style={{ color: "var(--text-faint)" }}>%</span>
          </div>
        </div>

        {/* Progress bar — thick */}
        <div className="mb-4">
          <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-sunken)" }}>
            <div className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progress.done ? 100 : progress.pct}%`,
                background: progress.done ? "var(--gradient-success)" : "var(--gradient-accent)",
                boxShadow: progress.done ? "0 0 12px rgba(16,185,129,0.5)" : "0 0 12px rgba(14,165,233,0.5)",
              }}
            />
          </div>
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
            {friendlyStatus}
          </span>
          {isDownloading && speed > 0 && (
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded"
              style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
              {formatSpeed(speed)}
            </span>
          )}
        </div>

        {/* Stats grid */}
        {(progress.total ?? 0) > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {/* Downloaded */}
            <div className="flex flex-col items-center p-3 rounded-xl"
              style={{ background: "var(--bg-sunken)", border: "1px solid var(--border)" }}>
              <span className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                style={{ color: "var(--text-faint)" }}>Downloaded</span>
              <span className="text-sm font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                {formatBytes(progress.completed ?? 0)}
              </span>
            </div>
            {/* Total size */}
            <div className="flex flex-col items-center p-3 rounded-xl"
              style={{ background: "var(--bg-sunken)", border: "1px solid var(--border)" }}>
              <span className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                style={{ color: "var(--text-faint)" }}>Total size</span>
              <span className="text-sm font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                {formatBytes(progress.total ?? 0)}
              </span>
            </div>
            {/* ETA */}
            <div className="flex flex-col items-center p-3 rounded-xl"
              style={{ background: "var(--bg-sunken)", border: "1px solid var(--border)" }}>
              <span className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                style={{ color: "var(--text-faint)" }}>ETA</span>
              <span className="text-sm font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                {progress.done ? "Done!" : (eta != null ? formatEta(eta) : "—")}
              </span>
            </div>
          </div>
        )}

      </div>

      {/* Privacy note */}
      <div className="mt-4 flex items-start gap-2 px-1">
        <Wifi className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "var(--text-ghost)" }} />
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-ghost)" }}>
          Downloaded once, stored locally. After this, PureQL works{" "}
          <span style={{ color: "var(--text-faint)", fontWeight: 600 }}>100% offline.</span>
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-xl"
          style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--danger)" }} />
          <div>
            <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--danger)" }}>Download failed</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{error}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>
              Make sure Ollama is running: <code className="font-mono">ollama serve</code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ReadyStep() {
  return (
    <div className="flex flex-col items-center text-center animate-fade-up">
      <LogoIcon gradient="var(--gradient-success)" glow="var(--success-glow)">
        <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={1.5} />
      </LogoIcon>
      <div className="space-y-3 mb-8">
        {["AI running locally", "Zero telemetry, ever", "Data stays on your machine"].map((item, i) => (
          <div key={item} className={`flex items-center gap-2.5 animate-fade-up animate-fade-up-delay-${i + 1}`}>
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "var(--success)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{item}</span>
          </div>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--text-ghost)" }}>
        Drag CSV · JSON · Parquet · Excel to get started
      </p>
    </div>
  );
}

/* ─── Main wizard ────────────────────────────────────────────────────────── */
export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep]                       = useState(0);
  const [hardware, setHardware]               = useState<HardwareData | null>(null);
  const [models, setModels]                   = useState<ModelData[]>([]);
  const [ollamaInstalled, setOllamaInstalled] = useState(false);
  const [ollamaRunning, setOllamaRunning]     = useState(false);
  const [ollamaStarting, setOllamaStarting]   = useState(false);
  const [ollamaStartError, setOllamaStartError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel]     = useState<string | null>(null);
  const [needsDownload, setNeedsDownload]     = useState(true);
  const [loading, setLoading]                 = useState(false);

  // Steps visibles: si el modelo ya está instalado, saltamos el download
  const visibleSteps = needsDownload
    ? BASE_STEPS
    : BASE_STEPS.filter(s => s.id !== "download");

  const currentStepDef = visibleSteps[step];

  /* Hardware detection */
  useEffect(() => {
    if (currentStepDef?.id !== "hardware") return;
    setLoading(true);
    detectHardware()
      .then((res) => {
        setHardware(res.hardware);
        setModels(res.recommendedModels);
        setLoading(false);

        // Auto-select the recommended model (or first one) as default
        if (res.recommendedModels?.length > 0) {
          const recommended = res.recommendedModels.find((m: ModelData) => m.recommended) ?? res.recommendedModels[0];
          if (recommended) {
            setSelectedModel(recommended.name);
            updateSettings({ model: recommended.name }).catch(() => {});
          }
        }

        setTimeout(() => setStep(s => s + 1), 1800);
      })
      .catch(() => { setLoading(false); setTimeout(() => setStep(s => s + 1), 1000); });
  }, [step]);

  /* Ollama check + auto-start */
  useEffect(() => {
    if (currentStepDef?.id !== "ollama") return;
    setLoading(true);
    setOllamaStartError(null);

    getOllamaStatus()
      .then(async (res) => {
        setOllamaInstalled(res.installed);
        setOllamaRunning(res.running);
        setLoading(false);

        if (res.installed && !res.running) {
          // Installed but not running — try to start it automatically
          setOllamaStarting(true);
          try {
            const startRes = await startOllama();
            setOllamaRunning(startRes.running);
            if (!startRes.running && startRes.error) {
              setOllamaStartError(startRes.error);
            }
          } catch {
            setOllamaStartError("Could not start Ollama. Please run 'ollama serve' manually.");
          } finally {
            setOllamaStarting(false);
            setTimeout(() => setStep(s => s + 1), 1200);
          }
        } else {
          // Already running or not installed — advance after brief pause
          setTimeout(() => setStep(s => s + 1), 1500);
        }
      })
      .catch(() => {
        setLoading(false);
        setTimeout(() => setStep(s => s + 1), 1000);
      });
  }, [step]);

  const handleRetryStart = async () => {
    setOllamaStartError(null);
    setOllamaStarting(true);
    try {
      const res = await startOllama();
      setOllamaRunning(res.running);
      if (!res.running && res.error) setOllamaStartError(res.error);
      else setTimeout(() => setStep(s => s + 1), 800);
    } catch {
      setOllamaStartError("Could not start Ollama. Please run 'ollama serve' manually.");
    } finally {
      setOllamaStarting(false);
    }
  };

  const handleModelSelect = async (name: string) => {
    setSelectedModel(name);
    await updateSettings({ model: name }).catch(() => {});

    // Verificar si el modelo ya está descargado
    const installed = await getInstalledModels();
    const modelBase = name.split(":")[0];
    setNeedsDownload(!installed.includes(modelBase));
  };

  // Smallest safe fallback if backend returns no models
  const DEFAULT_MODEL = "tinyllama";

  const handleNext = async () => {
    const nextStepDef = visibleSteps[step + 1];

    // If advancing TO the download step with no model chosen, pick the best available default
    if (nextStepDef?.id === "download" && !selectedModel) {
      const fallback =
        models.find((m) => m.recommended)?.name ??
        models[0]?.name ??
        DEFAULT_MODEL;
      setSelectedModel(fallback);
      await updateSettings({ model: fallback }).catch(() => {});
      const installed = await getInstalledModels();
      setNeedsDownload(!installed.includes(fallback.split(":")[0]));
    }

    if (step < visibleSteps.length - 1) setStep(s => s + 1);
    else onComplete();
  };

  const showNav    = !loading && ["welcome", "model", "ready"].includes(currentStepDef?.id ?? "");
  const isLastStep = step === visibleSteps.length - 1;
  const ctaBg      = isLastStep ? "var(--gradient-success)" : "var(--gradient-accent)";
  const ctaGlow    = isLastStep ? "var(--success-glow)"     : "var(--accent-glow-sm)";
  const titleGrad  = isLastStep
    ? "linear-gradient(135deg, var(--success-dark), var(--success))"
    : "linear-gradient(135deg, var(--accent-deeper), var(--accent), var(--accent2))";
  const isDownloadStep = currentStepDef?.id === "download";
  const activeModelName = selectedModel ?? DEFAULT_MODEL;
  const displayTitle = isDownloadStep
    ? `Downloading\n${activeModelName}`
    : currentStepDef?.title;

  return (
    <div className="onboarding-bg h-screen flex flex-col overflow-hidden" style={{ userSelect: "none" }}>
      <OrbLayer />
      <div data-tauri-drag-region className="h-8 w-full shrink-0 relative z-10" />

      <div className="flex-1 flex flex-col items-center justify-center px-8 relative z-10 overflow-y-auto">
        {/* Counter */}
        <div className="text-[10px] font-mono tracking-widest mb-5 uppercase"
          style={{ color: "var(--accent-dark)", opacity: 0.5 }}>
          {step + 1} / {visibleSteps.length}
        </div>

        {/* Title */}
        <h1
          key={`title-${step}`}
          className="text-center font-bold mb-8 leading-[1.15] whitespace-pre-line animate-fade-up"
          style={{
            fontSize: isDownloadStep ? "clamp(1.4rem, 3.5vw, 2rem)" : "clamp(2rem, 5vw, 2.75rem)",
            background: titleGrad,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {displayTitle}
        </h1>

        {/* Step body */}
        <div key={`body-${step}`} className="w-full flex flex-col items-center">
          {currentStepDef?.id === "welcome"  && <WelcomeStep />}
          {currentStepDef?.id === "hardware" && <HardwareStep hardware={hardware} loading={loading} />}
          {currentStepDef?.id === "ollama"   && <OllamaStep installed={ollamaInstalled} running={ollamaRunning} loading={loading} starting={ollamaStarting} startError={ollamaStartError} onRetry={handleRetryStart} />}
          {currentStepDef?.id === "model"    && <ModelStep models={models} selected={selectedModel} onSelect={handleModelSelect} />}
          {currentStepDef?.id === "download" && (
            <DownloadStep modelName={selectedModel ?? DEFAULT_MODEL} onDone={handleNext} />
          )}
          {currentStepDef?.id === "ready"    && <ReadyStep />}
        </div>

        {/* Loading shimmer */}
        {loading && (
          <div className="mt-8 rounded-full overflow-hidden" style={{ width: 120, height: 2, background: "var(--border)" }}>
            <div className="h-full rounded-full"
              style={{ width: "35%", background: "linear-gradient(90deg, transparent, var(--accent), transparent)", animation: "shimmer 1.2s ease-in-out infinite" }} />
          </div>
        )}

        {/* Nav */}
        {showNav && (
          <div className="flex items-center gap-3 mt-8">
            {step > 0 && !["hardware", "ollama", "download"].includes(currentStepDef?.id ?? "") && (
              <button className="btn-ghost" onClick={() => setStep(s => s - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" />Back
              </button>
            )}
            <button
              className="btn-primary"
              onClick={handleNext}
              style={{ background: ctaBg, boxShadow: ctaGlow }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = isLastStep ? "0 6px 28px rgba(16,185,129,0.4)" : "var(--accent-glow-md)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = ctaGlow; }}
            >
              {currentStepDef?.cta ?? "Continue"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Progress dots */}
      <div className="flex justify-center items-center gap-2 pb-8 relative z-10">
        {visibleSteps.map((_, i) => (
          <div key={i} className="rounded-full transition-all duration-300"
            style={{
              width: i === step ? 20 : 6, height: 6,
              background: i === step ? "var(--accent)" : i < step ? "var(--accent-border)" : "var(--border)",
            }} />
        ))}
      </div>
    </div>
  );
}