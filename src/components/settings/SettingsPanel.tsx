/**
 * SettingsPanel — user-configurable settings for PureQL.
 * Model params, Ollama endpoint, display preferences.
 */
import { useState, useEffect } from "react";
import { checkHealth, updateSettings, getOllamaStatus, startOllama } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import {
  Sliders, Server, Palette, ChevronDown, ChevronRight,
  Check, AlertCircle, RefreshCw, Play, Zap, Info,
} from "lucide-react";

/* ── Local persistence (localStorage as backup since no server-side store) */
const LS_KEY = "pureql_settings";

export interface PureQLSettings {
  // AI / model
  temperature:   number;
  maxTokens:     number;
  ollamaUrl:     string;
  ollamaTimeout: number;    // seconds
  // Preview
  previewRows:   number;
  // UI
  compactMode:   boolean;
  fontSize:      "xs" | "sm" | "md";
}

const DEFAULTS: PureQLSettings = {
  temperature:   0.1,
  maxTokens:     2048,
  ollamaUrl:     "http://127.0.0.1:11434",
  ollamaTimeout: 300,
  previewRows:   100,
  compactMode:   false,
  fontSize:      "sm",
};

function loadSettings(): PureQLSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s: PureQLSettings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

/* ── Sub-section toggle ────────────────────────────────────────────────── */
function Section({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderBottom: "1px solid #f1f5f9" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <Icon className="w-3.5 h-3.5" style={{ color: "#0ea5e9" }} />
        <span className="text-[11px] font-bold" style={{ color: "#334155" }}>{title}</span>
        <span className="ml-auto" style={{ color: "#94a3b8" }}>
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

/* ── Field helpers ─────────────────────────────────────────────────────── */
function FieldRow({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold" style={{ color: "#475569" }}>{label}</span>
        {hint && (
          <span title={hint} className="cursor-help">
            <Info className="w-3 h-3" style={{ color: "#94a3b8" }} />
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Slider({ min, max, step, value, onChange, displayFn }: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; displayFn?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: "#0ea5e9" }}
      />
      <span
        className="text-[10px] font-mono font-bold min-w-[36px] text-right"
        style={{ color: "#0ea5e9" }}
      >
        {displayFn ? displayFn(value) : value}
      </span>
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text" }: {
  value: string | number; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none transition-colors"
      style={{
        background: "#f8fafc", border: "1px solid #e2e8f0",
        color: "#334155",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = "#7dd3fc")}
      onBlur={(e)  => (e.currentTarget.style.borderColor = "#e2e8f0")}
    />
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative inline-flex items-center shrink-0 transition-colors duration-200"
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: value ? "#0ea5e9" : "#cbd5e1",
        border: "none", cursor: "pointer", padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute", width: 14, height: 14, borderRadius: "50%",
          background: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
          left: value ? 19 : 3,
          transition: "left 150ms",
        }}
      />
    </button>
  );
}

/* ── Ollama status widget ──────────────────────────────────────────────── */
function OllamaStatus() {
  const [status, setStatus] = useState<{ installed: boolean; running: boolean } | null>(null);
  const [starting, setStarting] = useState(false);

  const refresh = async () => {
    try {
      const s = await getOllamaStatus();
      setStatus(s);
    } catch {
      setStatus({ installed: false, running: false });
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleStart = async () => {
    setStarting(true);
    try {
      await startOllama();
      await refresh();
    } finally {
      setStarting(false);
    }
  };

  if (!status) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#f8fafc" }}>
        <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: "#cbd5e1" }} />
        <span className="text-[10px]" style={{ color: "#94a3b8" }}>Checking…</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{
      background: status.running ? "#f0fdf4" : "#fff7ed",
      borderColor: status.running ? "#86efac" : "#fed7aa",
    }}>
      <div className="w-2 h-2 rounded-full shrink-0" style={{
        background: status.running ? "#22c55e" : status.installed ? "#f97316" : "#ef4444",
      }} />
      <span className="text-[10px] font-medium flex-1" style={{
        color: status.running ? "#15803d" : "#9a3412",
      }}>
        {status.running ? "Ollama running" : status.installed ? "Ollama installed but not running" : "Ollama not installed"}
      </span>
      <button onClick={refresh} className="p-0.5" style={{ color: "#94a3b8" }}>
        <RefreshCw className="w-3 h-3" />
      </button>
      {status.installed && !status.running && (
        <button
          onClick={handleStart}
          disabled={starting}
          className="flex items-center gap-1 text-[9px] px-2 py-1 rounded-md font-semibold transition"
          style={{ background: "#0ea5e9", color: "#ffffff", border: "none", cursor: "pointer" }}
        >
          {starting
            ? <div className="w-2.5 h-2.5 rounded-full animate-spin" style={{ border: "1.5px solid #fff", borderTopColor: "transparent" }} />
            : <Play className="w-2.5 h-2.5" />}
          Start
        </button>
      )}
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────────── */
export function SettingsPanel() {
  const { activeModelInfo } = useAppStore();
  const [cfg, setCfg]       = useState<PureQLSettings>(loadSettings);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const update = <K extends keyof PureQLSettings>(key: K, val: PureQLSettings[K]) => {
    setCfg((prev) => ({ ...prev, [key]: val }));
    setSaved(false);
  };

  const handleSave = async () => {
    setError(null);
    try {
      // Persist to localStorage
      saveSettings(cfg);
      // Push relevant settings to the bridge server
      await updateSettings({
        model:    activeModelInfo?.modelId,
        provider: activeModelInfo?.type === "local" ? "ollama" : activeModelInfo?.provider,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const handleTestOllama = async () => {
    setTesting(true);
    setError(null);
    try {
      const h = await checkHealth();
      setSaved(false);
      setError(null);
      alert(`✅ Bridge connected — ${h.status} (v${h.version})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  };

  const handleReset = () => {
    setCfg({ ...DEFAULTS });
    setSaved(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#ffffff" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "#f1f5f9" }}>
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4" style={{ color: "#0ea5e9" }} />
          <span className="text-[12px] font-bold" style={{ color: "#1e293b" }}>Settings</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleReset}
            className="text-[9px] px-2 py-1 rounded-lg border transition-colors"
            style={{ borderColor: "#e2e8f0", color: "#94a3b8", background: "transparent" }}
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{
              background: saved ? "#22c55e" : "#0ea5e9",
              color: "#ffffff", border: "none", cursor: "pointer",
            }}
          >
            {saved ? <Check className="w-3 h-3" /> : null}
            {saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 mx-3 mt-2 px-3 py-2 rounded-lg" style={{ background: "#fff1f2", border: "1px solid #fecdd3" }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "#f43f5e" }} />
          <span className="text-[10px]" style={{ color: "#be123c" }}>{error}</span>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── AI / Model params ── */}
        <Section title="AI Model Parameters" icon={Zap}>
          <FieldRow
            label="Temperature"
            hint="Controls randomness. Lower = more deterministic (recommended for data tasks)."
          >
            <Slider
              min={0} max={1} step={0.05} value={cfg.temperature}
              onChange={(v) => update("temperature", v)}
              displayFn={(v) => v.toFixed(2)}
            />
          </FieldRow>

          <FieldRow
            label="Max tokens"
            hint="Maximum tokens the model generates per response."
          >
            <Slider
              min={512} max={8192} step={256} value={cfg.maxTokens}
              onChange={(v) => update("maxTokens", v)}
              displayFn={(v) => v.toLocaleString()}
            />
          </FieldRow>

          <FieldRow label="Preview rows" hint="How many rows to load in the Data preview.">
            <Slider
              min={50} max={1000} step={50} value={cfg.previewRows}
              onChange={(v) => update("previewRows", v)}
              displayFn={(v) => `${v} rows`}
            />
          </FieldRow>
        </Section>

        {/* ── Ollama ── */}
        <Section title="Ollama (Local AI)" icon={Server}>
          <OllamaStatus />

          <FieldRow label="Ollama API URL" hint="Change this if Ollama runs on a remote server or a different port.">
            <TextInput
              value={cfg.ollamaUrl}
              placeholder="http://127.0.0.1:11434"
              onChange={(v) => update("ollamaUrl", v)}
            />
          </FieldRow>

          <FieldRow
            label="Request timeout (seconds)"
            hint="Increase if your model takes long to load into memory on first call."
          >
            <Slider
              min={30} max={600} step={30} value={cfg.ollamaTimeout}
              onChange={(v) => update("ollamaTimeout", v)}
              displayFn={(v) => `${v}s`}
            />
          </FieldRow>

          <button
            onClick={handleTestOllama}
            disabled={testing}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-semibold transition"
            style={{
              background: "#f0f9ff", border: "1px solid #bae6fd",
              color: "#0369a1", cursor: "pointer",
            }}
          >
            {testing
              ? <div className="w-3 h-3 rounded-full animate-spin" style={{ border: "1.5px solid #0ea5e9", borderTopColor: "transparent" }} />
              : <Server className="w-3 h-3" />}
            {testing ? "Testing…" : "Test bridge connection"}
          </button>
        </Section>

        {/* ── Display ── */}
        <Section title="Display" icon={Palette}>
          <FieldRow label="Font size">
            <div className="flex gap-2">
              {(["xs", "sm", "md"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => update("fontSize", f)}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition border"
                  style={{
                    background: cfg.fontSize === f ? "#e0f2fe" : "#f8fafc",
                    borderColor: cfg.fontSize === f ? "#7dd3fc" : "#e2e8f0",
                    color: cfg.fontSize === f ? "#0369a1" : "#64748b",
                    cursor: "pointer",
                  }}
                >
                  {f === "xs" ? "Small" : f === "sm" ? "Medium" : "Large"}
                </button>
              ))}
            </div>
          </FieldRow>

          <FieldRow label="Compact table mode" hint="Reduce row height and font size in data tables.">
            <div className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: "#64748b" }}>
                {cfg.compactMode ? "Compact (denser rows)" : "Standard (comfortable rows)"}
              </span>
              <Toggle value={cfg.compactMode} onChange={(v) => update("compactMode", v)} />
            </div>
          </FieldRow>
        </Section>

        {/* ── About ── */}
        <div className="px-4 py-4 space-y-1">
          <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#cbd5e1" }}>About</div>
          <div className="text-[10px]" style={{ color: "#94a3b8" }}>PureQL — Pure data. Pure queries. Pure local.</div>
          <div className="text-[10px]" style={{ color: "#cbd5e1" }}>Open Core · MIT License · v0.1.0-dev</div>
        </div>
      </div>
    </div>
  );
}

export { loadSettings };
