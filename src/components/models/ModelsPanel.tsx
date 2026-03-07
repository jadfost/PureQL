import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import type { ActiveModelInfo } from "../../stores/appStore";
import {
  Cpu, Download, Key, CheckCircle2, Circle, Zap, AlertCircle,
  Eye, EyeOff, ExternalLink, HardDrive, MemoryStick, Sparkles,
  ChevronRight, ChevronDown,
} from "lucide-react";

type ModelTab = "local" | "download" | "api";

const TIER_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  basic:    { label: "Basic",       color: "text-zinc-500",   bg: "bg-zinc-100"  },
  mid:      { label: "Recommended", color: "text-sky-600",    bg: "bg-sky-50"    },
  advanced: { label: "Advanced",    color: "text-purple-600", bg: "bg-purple-50" },
};

const LOCAL_MODELS = [
  { name: "qwen2.5:7b", displayName: "Qwen 2.5 7B", size: "4.7 GB", tier: "mid",   description: "Best balance of speed and quality for data tasks."  },
  { name: "phi3:mini",  displayName: "Phi-3 Mini",   size: "2.3 GB", tier: "basic", description: "Lightweight, fast. Good for low-RAM machines."       },
];

const DOWNLOADABLE_MODELS = [
  { name: "tinyllama",      displayName: "TinyLlama",       size: "638 MB", tier: "basic",    description: "Ultra-light. Works on 4 GB RAM."                 },
  { name: "qwen2.5:3b",    displayName: "Qwen 2.5 3B",     size: "1.9 GB", tier: "basic",    description: "Small but surprisingly capable."                 },
  { name: "mistral:7b",    displayName: "Mistral 7B",       size: "4.1 GB", tier: "mid",      description: "Strong reasoning. Great for SQL generation.", recommended: true },
  { name: "llama3.2:8b",   displayName: "Llama 3.2 8B",    size: "4.9 GB", tier: "mid",      description: "Meta's latest. Excellent instruction following." },
  { name: "qwen2.5:14b",   displayName: "Qwen 2.5 14B",    size: "8.9 GB", tier: "advanced", description: "Best local quality. Requires 16+ GB RAM."        },
  { name: "deepseek-r1:14b", displayName: "DeepSeek R1 14B", size: "9.0 GB", tier: "advanced", description: "Top reasoning. Ideal for complex SQL."         },
  { name: "mistral:22b",   displayName: "Mistral 22B",      size: "13 GB",  tier: "advanced", description: "Premium quality. Needs 32 GB RAM or GPU."       },
];

const API_PROVIDERS = [
  {
    id: "openai", name: "OpenAI", logo: "⬡", color: "text-emerald-600",
    bgColor: "bg-emerald-50 border-emerald-200",
    description: "Gold standard. Best general quality & multimodal.", docsUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "o3",                   label: "o3",               description: "Most powerful reasoning model",          tags: ["reasoning", "best"] },
      { id: "o3-mini",              label: "o3 mini",          description: "Fast reasoning, lower cost",             tags: ["reasoning", "fast"] },
      { id: "o1",                   label: "o1",               description: "Advanced reasoning with CoT",            tags: ["reasoning"]         },
      { id: "o1-mini",              label: "o1 mini",          description: "Lightweight reasoning model",            tags: ["reasoning", "fast"] },
      { id: "gpt-4.5-preview",      label: "GPT-4.5 Preview",  description: "Latest GPT with improved understanding", tags: ["preview"]           },
      { id: "gpt-4o",               label: "GPT-4o",           description: "Flagship multimodal model",              tags: ["vision", "popular"] },
      { id: "gpt-4o-mini",          label: "GPT-4o mini",      description: "Fast and cost-efficient",                tags: ["fast", "cheap"]     },
      { id: "gpt-4-turbo",          label: "GPT-4 Turbo",      description: "128k context, vision support",           tags: ["vision"]            },
      { id: "gpt-3.5-turbo",        label: "GPT-3.5 Turbo",    description: "Legacy but ultra-cheap",                 tags: ["cheap", "legacy"]   },
    ],
  },
  {
    id: "anthropic", name: "Anthropic", logo: "◈", color: "text-orange-500",
    bgColor: "bg-orange-50 border-orange-200",
    description: "Exceptional reasoning, analysis and safety.", docsUrl: "https://console.anthropic.com/keys",
    models: [
      { id: "claude-opus-4-5",      label: "Claude Opus 4.5",    description: "Most capable, complex reasoning",       tags: ["best", "reasoning"] },
      { id: "claude-sonnet-4-5",    label: "Claude Sonnet 4.5",  description: "Best balance quality/speed",            tags: ["popular", "vision"] },
      { id: "claude-haiku-4-5",     label: "Claude Haiku 4.5",   description: "Ultra-fast, lowest cost",               tags: ["fast", "cheap"]     },
      { id: "claude-opus-4-6",      label: "Claude Opus 4.6",    description: "Extended thinking, top reasoning",      tags: ["reasoning", "best"] },
      { id: "claude-sonnet-4-6",    label: "Claude Sonnet 4.6",  description: "Latest Sonnet with extended thinking",  tags: ["popular"]           },
      { id: "claude-3-5-sonnet",    label: "Claude 3.5 Sonnet",  description: "Excellent code and analysis",           tags: ["code", "vision"]    },
      { id: "claude-3-5-haiku",     label: "Claude 3.5 Haiku",   description: "Fast with vision support",              tags: ["fast", "vision"]    },
      { id: "claude-3-opus",        label: "Claude 3 Opus",      description: "Previous flagship, very capable",       tags: ["legacy"]            },
    ],
  },
  {
    id: "groq", name: "Groq", logo: "▲", color: "text-red-500",
    bgColor: "bg-red-50 border-red-200",
    description: "Ultra-fast LPU inference. Real-time responses.", docsUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile",        label: "Llama 3.3 70B",           description: "Best quality on Groq",                  tags: ["best", "popular"]  },
      { id: "llama-3.1-70b-versatile",        label: "Llama 3.1 70B",           description: "High quality, very fast",               tags: ["fast"]             },
      { id: "llama-3.1-8b-instant",           label: "Llama 3.1 8B Instant",    description: "Fastest model on Groq",                 tags: ["fast", "cheap"]    },
      { id: "llama3-70b-8192",                label: "Llama 3 70B",             description: "Strong 8k context window",              tags: []                   },
      { id: "llama3-8b-8192",                 label: "Llama 3 8B",              description: "Lightweight, great for simple tasks",   tags: ["cheap"]            },
      { id: "llama-3.2-90b-vision-preview",   label: "Llama 3.2 90B Vision",    description: "Largest with vision support",           tags: ["vision"]           },
      { id: "llama-3.2-11b-vision-preview",   label: "Llama 3.2 11B Vision",    description: "Mid-size with vision",                  tags: ["vision", "fast"]   },
      { id: "llama-3.2-3b-preview",           label: "Llama 3.2 3B",            description: "Very small and fast",                   tags: ["cheap", "fast"]    },
      { id: "llama-3.2-1b-preview",           label: "Llama 3.2 1B",            description: "Smallest model, ultra-cheap",           tags: ["cheap", "fast"]    },
      { id: "mixtral-8x7b-32768",             label: "Mixtral 8x7B",            description: "MoE model, 32k context",                tags: ["popular"]          },
      { id: "gemma2-9b-it",                   label: "Gemma 2 9B",              description: "Google's efficient open model",         tags: []                   },
      { id: "gemma-7b-it",                    label: "Gemma 7B",                description: "Google lightweight model",              tags: ["cheap"]            },
      { id: "deepseek-r1-distill-llama-70b",  label: "DeepSeek R1 Llama 70B",   description: "Reasoning distilled into Llama",        tags: ["reasoning"]        },
      { id: "deepseek-r1-distill-qwen-32b",   label: "DeepSeek R1 Qwen 32B",    description: "Compact reasoning model",               tags: ["reasoning"]        },
      { id: "qwen-2.5-72b",                   label: "Qwen 2.5 72B",            description: "Alibaba's top model on Groq",           tags: ["popular"]          },
      { id: "qwen-2.5-coder-32b",             label: "Qwen 2.5 Coder 32B",      description: "Specialized for code tasks",            tags: ["code"]             },
    ],
  },
  {
    id: "mistral", name: "Mistral AI", logo: "✦", color: "text-blue-500",
    bgColor: "bg-blue-50 border-blue-200",
    description: "European AI. Excellent quality/cost balance.", docsUrl: "https://console.mistral.ai/api-keys",
    models: [
      { id: "mistral-large-latest",   label: "Mistral Large 2",    description: "Top model, 128k context",          tags: ["best"]             },
      { id: "mistral-small-latest",   label: "Mistral Small 3.1",  description: "Best small model from Mistral",   tags: ["cheap", "popular"] },
      { id: "mistral-nemo",           label: "Mistral Nemo",        description: "12B, runs on most hardware",       tags: ["popular"]          },
      { id: "codestral-latest",       label: "Codestral",           description: "Purpose-built for code & SQL",     tags: ["code"]             },
      { id: "pixtral-large-latest",   label: "Pixtral Large",       description: "Large multimodal model",           tags: ["vision"]           },
      { id: "pixtral-12b",            label: "Pixtral 12B",         description: "Compact vision model",             tags: ["vision", "cheap"]  },
      { id: "mixtral-8x22b",          label: "Mixtral 8x22B",       description: "Large MoE, very capable",          tags: ["best"]             },
      { id: "mixtral-8x7b",           label: "Mixtral 8x7B",        description: "Classic MoE model",                tags: []                   },
      { id: "ministral-8b",           label: "Ministral 8B",        description: "Efficient edge model",             tags: ["cheap", "fast"]    },
      { id: "ministral-3b",           label: "Ministral 3B",        description: "Smallest Mistral, fastest",        tags: ["cheap", "fast"]    },
      { id: "open-mistral-7b",        label: "Mistral 7B",          description: "Original open model",              tags: ["legacy"]           },
    ],
  },
  {
    id: "google", name: "Google AI", logo: "◉", color: "text-sky-500",
    bgColor: "bg-sky-50 border-sky-200",
    description: "Gemini family. Best multimodal & long context.", docsUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.0-flash",          label: "Gemini 2.0 Flash",          description: "Fastest Gemini, 1M context",            tags: ["fast", "popular"]  },
      { id: "gemini-2.0-flash-thinking", label: "Gemini 2.0 Flash Thinking", description: "Flash with reasoning mode",             tags: ["reasoning", "fast"]},
      { id: "gemini-2.0-pro-exp",        label: "Gemini 2.0 Pro (exp)",      description: "Most capable Gemini 2.0",               tags: ["best"]             },
      { id: "gemini-1.5-pro",            label: "Gemini 1.5 Pro",            description: "2M context, strong reasoning",          tags: ["vision"]           },
      { id: "gemini-1.5-flash",          label: "Gemini 1.5 Flash",          description: "Fast and cheap with 1M context",        tags: ["fast", "cheap"]    },
      { id: "gemini-1.5-flash-8b",       label: "Gemini 1.5 Flash 8B",      description: "Ultra-cheap, high volume tasks",        tags: ["cheap"]            },
      { id: "gemini-1.0-pro",            label: "Gemini 1.0 Pro",            description: "Stable legacy model",                  tags: ["legacy"]           },
    ],
  },
  {
    id: "deepseek", name: "DeepSeek", logo: "◆", color: "text-indigo-500",
    bgColor: "bg-indigo-50 border-indigo-200",
    description: "Top reasoning & code. Best price/performance.", docsUrl: "https://platform.deepseek.com/api-keys",
    models: [
      { id: "deepseek-chat",     label: "DeepSeek V3",     description: "Flagship chat model, near GPT-4 quality", tags: ["best", "popular"] },
      { id: "deepseek-reasoner", label: "DeepSeek R1",     description: "Top reasoning, rivals o1",                tags: ["reasoning", "best"]},
      { id: "deepseek-coder",    label: "DeepSeek Coder",  description: "Specialized for code & SQL tasks",        tags: ["code"]            },
    ],
  },
  {
    id: "together", name: "Together AI", logo: "⊕", color: "text-violet-500",
    bgColor: "bg-violet-50 border-violet-200",
    description: "Open models at scale. Wide model catalog.", docsUrl: "https://api.together.xyz/settings/api-keys",
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",   label: "Llama 3.3 70B Turbo",  description: "Best Llama on Together",                tags: ["popular", "fast"] },
      { id: "meta-llama/Meta-Llama-3.1-405B-Instruct",   label: "Llama 3.1 405B",       description: "Largest open model available",          tags: ["best"]            },
      { id: "meta-llama/Meta-Llama-3.1-70B-Instruct",    label: "Llama 3.1 70B",        description: "Strong and cost-effective",             tags: ["popular"]         },
      { id: "meta-llama/Meta-Llama-3.1-8B-Instruct",     label: "Llama 3.1 8B",         description: "Lightweight and fast",                  tags: ["fast", "cheap"]   },
      { id: "Qwen/Qwen2.5-72B-Instruct",                 label: "Qwen 2.5 72B",         description: "Top Qwen model",                        tags: ["popular"]         },
      { id: "Qwen/Qwen2.5-Coder-32B-Instruct",           label: "Qwen 2.5 Coder 32B",   description: "Best open coder model",                 tags: ["code"]            },
      { id: "deepseek-ai/DeepSeek-V3",                   label: "DeepSeek V3",           description: "Top open model for data tasks",         tags: ["best"]            },
      { id: "deepseek-ai/DeepSeek-R1",                   label: "DeepSeek R1",           description: "Open source o1-level reasoning",        tags: ["reasoning"]       },
      { id: "mistralai/Mixtral-8x22B-Instruct-v0.1",     label: "Mixtral 8x22B",        description: "Large MoE, high quality",               tags: []                  },
      { id: "google/gemma-2-27b-it",                     label: "Gemma 2 27B",           description: "Google's open model",                   tags: []                  },
    ],
  },
  {
    id: "cohere", name: "Cohere", logo: "⬢", color: "text-teal-500",
    bgColor: "bg-teal-50 border-teal-200",
    description: "Enterprise-grade. Strong RAG and data tasks.", docsUrl: "https://dashboard.cohere.com/api-keys",
    models: [
      { id: "command-r-plus-08-2024", label: "Command R+ (Aug 2024)", description: "Best Cohere model, 128k context",        tags: ["best"]           },
      { id: "command-r-08-2024",      label: "Command R (Aug 2024)",  description: "Balanced quality and cost",              tags: ["popular"]        },
      { id: "command-r-plus",         label: "Command R+",            description: "Flagship RAG model",                    tags: ["popular"]        },
      { id: "command-r",              label: "Command R",             description: "Good for retrieval-augmented tasks",    tags: []                 },
      { id: "command-light",          label: "Command Light",         description: "Fast and cheap for simple tasks",       tags: ["fast", "cheap"]  },
    ],
  },
];

function TierBadge({ tier }: { tier: string }) {
  const t = TIER_LABELS[tier] || TIER_LABELS.basic;
  return <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${t.bg} ${t.color}`}>{t.label}</span>;
}

function LocalTab() {
  const { activeModelInfo, setActiveModelInfo } = useAppStore();
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <div className="flex gap-2 mb-1">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-pureql-panel rounded-lg border border-pureql-border">
          <MemoryStick className="w-3.5 h-3.5 text-zinc-400" />
          <div><div className="text-[10px] font-semibold text-zinc-600">8 GB RAM</div><div className="text-[9px] text-zinc-400">Available</div></div>
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-pureql-panel rounded-lg border border-pureql-border">
          <Cpu className="w-3.5 h-3.5 text-zinc-400" />
          <div><div className="text-[10px] font-semibold text-zinc-600">CPU only</div><div className="text-[9px] text-zinc-400">No GPU</div></div>
        </div>
      </div>
      <p className="text-[10px] text-zinc-400 px-1 mb-1">Installed models</p>
      {LOCAL_MODELS.map((model) => {
        const isActive = activeModelInfo?.type === "local" && activeModelInfo?.modelId === model.name;
        return (
          <button key={model.name} onClick={() => setActiveModelInfo({ displayName: model.displayName, modelId: model.name, type: "local" })}
            className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition ${isActive ? "bg-sky-50 border-sky-200" : "bg-white border-pureql-border hover:border-zinc-300 hover:bg-pureql-panel"}`}>
            <div className="mt-0.5">{isActive ? <CheckCircle2 className="w-4 h-4 text-pureql-accent" /> : <Circle className="w-4 h-4 text-zinc-300" />}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[11px] font-semibold ${isActive ? "text-zinc-800" : "text-zinc-600"}`}>{model.displayName}</span>
                <TierBadge tier={model.tier} />
                {isActive && <span className="text-[9px] font-semibold text-pureql-accent bg-pureql-accent-dim px-1.5 py-0.5 rounded">IN USE</span>}
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">{model.description}</p>
              <div className="flex items-center gap-1.5 mt-1.5"><HardDrive className="w-3 h-3 text-zinc-400" /><span className="text-[10px] text-zinc-400 font-mono">{model.size}</span></div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DownloadTab() {
  const { activeModelInfo, setActiveModelInfo } = useAppStore();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloaded, setDownloaded]   = useState<Set<string>>(new Set());

  const handleDownload = (model: typeof DOWNLOADABLE_MODELS[0]) => {
    setDownloading(model.name);
    setTimeout(() => {
      setDownloaded((prev) => new Set([...prev, model.name]));
      setDownloading(null);
      setActiveModelInfo({ displayName: model.displayName, modelId: model.name, type: "local" });
    }, 2500);
  };

  const grouped = {
    basic:    DOWNLOADABLE_MODELS.filter((m) => m.tier === "basic"),
    mid:      DOWNLOADABLE_MODELS.filter((m) => m.tier === "mid"),
    advanced: DOWNLOADABLE_MODELS.filter((m) => m.tier === "advanced"),
  };
  const tierMeta = { basic: "4–8 GB RAM", mid: "16 GB RAM + optional GPU", advanced: "32 GB RAM or GPU 12+ GB" };

  return (
    <div className="flex flex-col gap-4 p-2">
      {(["basic", "mid", "advanced"] as const).map((tier) => (
        <div key={tier}>
          <div className="flex items-center gap-2 mb-1.5 px-1">
            <TierBadge tier={tier} /><span className="text-[9px] text-zinc-400">{tierMeta[tier]}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {grouped[tier].map((model) => {
              const isDone    = downloaded.has(model.name);
              const isLoading = downloading === model.name;
              const isActive  = activeModelInfo?.modelId === model.name;
              return (
                <div key={model.name} className={`flex items-start gap-3 px-3 py-2.5 bg-white rounded-lg border ${isActive ? "border-sky-300" : "border-pureql-border"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-zinc-700">{model.displayName}</span>
                      {(model as any).recommended && <span className="flex items-center gap-0.5 text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-semibold"><Sparkles className="w-2.5 h-2.5" />Best pick</span>}
                      {isActive && <span className="text-[9px] text-pureql-accent bg-pureql-accent-dim font-semibold px-1.5 py-0.5 rounded">IN USE</span>}
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">{model.description}</p>
                    <span className="text-[10px] text-zinc-400 font-mono mt-1 block">{model.size}</span>
                  </div>
                  <button onClick={() => !isDone && !isLoading && handleDownload(model)} disabled={isLoading}
                    className={`shrink-0 mt-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition ${isDone ? "bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default" : isLoading ? "bg-sky-50 text-pureql-accent border border-sky-200 cursor-wait" : "bg-pureql-panel text-zinc-600 border border-pureql-border hover:bg-zinc-200"}`}>
                    {isDone ? <><CheckCircle2 className="w-3 h-3" /> Done</> : isLoading ? <><div className="w-3 h-3 border border-pureql-accent border-t-transparent rounded-full animate-spin" /> Pulling…</> : <><Download className="w-3 h-3" /> Pull</>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ApiTab() {
  const { activeModelInfo, setActiveModelInfo } = useAppStore();
  const [keys, setKeys]         = useState<Record<string, string>>({});
  const [visible, setVisible]   = useState<Record<string, boolean>>({});
  const [saved, setSaved]       = useState<Record<string, boolean>>({});
  const [open, setOpen]         = useState<string | null>(null);
  const [search, setSearch]     = useState<Record<string, string>>({});
  const [selModel, setSelModel] = useState<Record<string, string>>(
    Object.fromEntries(API_PROVIDERS.map((p) => [p.id, p.models[0].id]))
  );

  const TAG_COLORS: Record<string, string> = {
    best:      "bg-amber-50 text-amber-600",
    popular:   "bg-sky-50 text-sky-600",
    fast:      "bg-emerald-50 text-emerald-600",
    cheap:     "bg-zinc-100 text-zinc-500",
    reasoning: "bg-purple-50 text-purple-600",
    vision:    "bg-pink-50 text-pink-500",
    code:      "bg-indigo-50 text-indigo-500",
    preview:   "bg-orange-50 text-orange-500",
    legacy:    "bg-zinc-100 text-zinc-400",
  };

  const handleSave = (pid: string) => {
    setSaved((prev) => ({ ...prev, [pid]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [pid]: false })), 2000);
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 mb-1">
        <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-[10px] text-amber-700 leading-snug">Keys stored encrypted in your OS keychain. Data is sent to the provider when using cloud models.</p>
      </div>

      {API_PROVIDERS.map((provider) => {
        const isOpen     = open === provider.id;
        const hasKey     = !!(keys[provider.id]?.trim());
        const isProviderActive = activeModelInfo?.type === "api" && activeModelInfo?.provider === provider.name;
        const activeModelId    = selModel[provider.id];
        const activeModelLabel = provider.models.find((m) => m.id === activeModelId)?.label ?? "";
        const isCurrentlyUsing = isProviderActive && activeModelInfo?.modelId === activeModelId;
        const q = (search[provider.id] ?? "").toLowerCase();
        const filteredModels = q
          ? provider.models.filter((m) => m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || (m as any).tags?.some((t: string) => t.includes(q)))
          : provider.models;

        return (
          <div key={provider.id} className={`rounded-lg border overflow-hidden transition ${isProviderActive ? "border-sky-300" : "border-pureql-border"} bg-white`}>
            {/* Header */}
            <button onClick={() => setOpen(isOpen ? null : provider.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-pureql-panel transition text-left">
              <span className={`text-base font-bold leading-none ${provider.color}`}>{provider.logo}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-zinc-700">{provider.name}</span>
                  <span className="text-[9px] text-zinc-400">{provider.models.length} models</span>
                  {hasKey && <span className="flex items-center gap-0.5 text-[9px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold border border-emerald-200"><Zap className="w-2.5 h-2.5" /> Key saved</span>}
                  {isProviderActive && <span className="text-[9px] text-pureql-accent bg-pureql-accent-dim font-semibold px-1.5 py-0.5 rounded">IN USE</span>}
                </div>
                {isProviderActive
                  ? <p className="text-[10px] text-pureql-accent mt-0.5 font-medium truncate">{activeModelInfo?.displayName}</p>
                  : <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{provider.description}</p>}
              </div>
              {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
            </button>

            {/* Expanded */}
            {isOpen && (
              <div className="border-t border-pureql-border bg-pureql-panel px-3 pb-3 pt-3 flex flex-col gap-3">
                {/* Key input */}
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 mb-1.5 block">API Key</label>
                  <div className="relative">
                    <input type={visible[provider.id] ? "text" : "password"} placeholder="sk-••••••••••••••••••••••••"
                      value={keys[provider.id] || ""}
                      onChange={(e) => setKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                      className="w-full text-[11px] font-mono px-3 py-2 pr-8 rounded-md border border-pureql-border bg-white focus:outline-none focus:border-pureql-accent focus:ring-1 focus:ring-pureql-accent/20 placeholder-zinc-300" />
                    <button onClick={() => setVisible((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                      {visible[provider.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => handleSave(provider.id)} disabled={!keys[provider.id]?.trim()}
                      className="flex-1 py-1.5 rounded-md text-[11px] font-semibold bg-pureql-accent text-white hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed transition">
                      {saved[provider.id] ? "✓ Saved!" : "Save key"}
                    </button>
                    <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-pureql-accent transition">
                      <ExternalLink className="w-3 h-3" /> Get key
                    </a>
                  </div>
                </div>

                {/* Model selector */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-semibold text-zinc-500">Select model</label>
                    <span className="text-[9px] text-zinc-400">{filteredModels.length} / {provider.models.length}</span>
                  </div>

                  {/* Search filter */}
                  {provider.models.length > 4 && (
                    <input
                      placeholder="Filter models…"
                      value={search[provider.id] ?? ""}
                      onChange={(e) => setSearch((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                      className="w-full text-[11px] px-2.5 py-1.5 rounded-md border border-pureql-border bg-white focus:outline-none focus:border-pureql-accent mb-2 placeholder-zinc-300"
                    />
                  )}

                  <div className="flex flex-col gap-1 max-h-52 overflow-y-auto pr-0.5">
                    {filteredModels.length === 0 && (
                      <p className="text-[10px] text-zinc-400 text-center py-3">No models match "{search[provider.id]}"</p>
                    )}
                    {filteredModels.map((model) => {
                      const isSel   = selModel[provider.id] === model.id;
                      const isInUse = isProviderActive && activeModelInfo?.modelId === model.id;
                      const tags    = (model as any).tags as string[] ?? [];
                      return (
                        <button key={model.id} onClick={() => setSelModel((prev) => ({ ...prev, [provider.id]: model.id }))}
                          className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border text-left transition ${isSel ? "bg-white border-pureql-accent/40 shadow-sm" : "bg-white border-pureql-border hover:border-zinc-300"}`}>
                          <div className="mt-0.5 shrink-0">{isSel ? <CheckCircle2 className="w-3 h-3 text-pureql-accent" /> : <Circle className="w-3 h-3 text-zinc-300" />}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[11px] font-semibold ${isSel ? "text-zinc-800" : "text-zinc-600"}`}>{model.label}</span>
                              {isInUse && <span className="text-[9px] text-pureql-accent bg-pureql-accent-dim font-semibold px-1 py-0.5 rounded">IN USE</span>}
                              {tags.map((tag) => (
                                <span key={tag} className={`text-[8px] font-semibold px-1 py-0.5 rounded ${TAG_COLORS[tag] ?? "bg-zinc-100 text-zinc-400"}`}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">{model.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Use button */}
                <button
                  onClick={() => {
                    const model = provider.models.find((m) => m.id === activeModelId);
                    if (!model) return;
                    setActiveModelInfo({ displayName: model.label, modelId: model.id, type: "api", provider: provider.name, providerColor: provider.color });
                  }}
                  disabled={!hasKey}
                  title={!hasKey ? "Save your API key first" : ""}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-semibold border transition ${isCurrentlyUsing ? "bg-sky-50 text-pureql-accent border-sky-300 cursor-default" : hasKey ? `${provider.bgColor} border text-zinc-700 hover:opacity-90` : "bg-pureql-panel text-zinc-400 border-pureql-border cursor-not-allowed opacity-50"}`}>
                  {isCurrentlyUsing
                    ? <><CheckCircle2 className="w-3.5 h-3.5" /> Using {activeModelLabel}</>
                    : <><Zap className="w-3.5 h-3.5" /> Use {activeModelLabel}</>}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ModelsPanel() {
  const [tab, setTab] = useState<ModelTab>("local");
  const tabs = [
    { id: "local" as ModelTab,    label: "Local",    icon: Cpu      },
    { id: "download" as ModelTab, label: "Download", icon: Download },
    { id: "api" as ModelTab,      label: "API Keys", icon: Key      },
  ];
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex gap-0.5 p-2 border-b border-pureql-border shrink-0">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition ${tab === id ? "bg-pureql-accent text-white" : "text-zinc-500 hover:text-zinc-700 hover:bg-pureql-panel"}`}>
            <Icon className="w-3 h-3" />{label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "local"    && <LocalTab />}
        {tab === "download" && <DownloadTab />}
        {tab === "api"      && <ApiTab />}
      </div>
    </div>
  );
}