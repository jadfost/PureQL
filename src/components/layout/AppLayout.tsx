import { useState, useRef, useCallback, useEffect } from "react";
import { ChatPanel } from "../chat/ChatPanel";
import { DataPreview } from "../preview/DataPreview";
import { MiniPreview } from "../preview/MiniPreview";
import { VersionPanel } from "../versions/VersionPanel";
import { ModelsPanel } from "../models/ModelsPanel";
import { DatasetManager } from "../datasets/DatasetManager";
import { DatabaseModal } from "../database/DatabaseModal";
import { SettingsPanel } from "../settings/SettingsPanel";
import { FileDropZone } from "./FileDropZone";
import { useAppStore } from "../../stores/appStore";
import {
  Hexagon, GitBranch, Cpu, Database, Layers,
  Plus, SplitSquareVertical, Pin, X,
  Zap, ChevronLeft, Settings,
} from "lucide-react";
import { addDataset as apiAddDataset } from "../../lib/api";

type SidePanel = "versions" | "models" | "datasets" | "database" | "settings";

// ─────────────────────────────────────────────────────────────────────────────
// Resize hook — supports direction + sign inversion
// direction "h": tracks clientX   | invert=false → drag right = bigger
//                                  | invert=true  → drag left  = bigger
// direction "v": tracks clientY   | invert=false → drag down  = bigger
//                                  | invert=true  → drag up   = bigger
// ─────────────────────────────────────────────────────────────────────────────
function useResize(
  initial: number,
  min: number,
  max: number,
  direction: "h" | "v" = "h",
  invert = false
) {
  const [size, setSize] = useState(initial);
  const sizeRef = useRef(initial);  // always-fresh copy for closures
  sizeRef.current = size;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startPos = direction === "h" ? e.clientX : e.clientY;
      const startSize = sizeRef.current;

      const onMove = (ev: MouseEvent) => {
        const raw = direction === "h" ? ev.clientX - startPos : ev.clientY - startPos;
        const delta = invert ? -raw : raw;
        setSize(Math.min(max, Math.max(min, startSize + delta)));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = direction === "h" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [direction, invert, min, max]
  );

  return { size, setSize, onMouseDown };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resize handle visual
// ─────────────────────────────────────────────────────────────────────────────
function HHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{ cursor: "col-resize", width: 5, flexShrink: 0, position: "relative", zIndex: 10 }}
      className="group"
    >
      {/* wider invisible hit area */}
      <div style={{ position: "absolute", inset: "0 -4px", cursor: "col-resize" }} />
      <div
        style={{
          width: "100%", height: "100%",
          background: "var(--border)",
          transition: "background 150ms",
        }}
        className="group-hover:!bg-[var(--accent)]"
      />
    </div>
  );
}

function VHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{ cursor: "row-resize", height: 6, flexShrink: 0, position: "relative", zIndex: 10 }}
      className="group flex items-center justify-center"
    >
      <div style={{ position: "absolute", inset: "-4px 0" }} />
      <div
        style={{
          width: "100%", height: 2,
          background: "var(--border)",
          transition: "background 150ms",
        }}
        className="group-hover:!bg-[var(--accent)]"
      />
      {/* Drag grip dots */}
      <div className="absolute flex gap-0.5 pointer-events-none" style={{ opacity: 0.4 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--text-faint)" }} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Side panel content renderer
// ─────────────────────────────────────────────────────────────────────────────
function PanelContent({ id }: { id: SidePanel }) {
  if (id === "versions") return <VersionPanel />;
  if (id === "models")   return <ModelsPanel />;
  if (id === "datasets") return <DatasetManager />;
  if (id === "settings") return <SettingsPanel />;
  return null;
}

const SIDE_ITEMS: { id: SidePanel; Icon: React.ElementType; label: string }[] = [
  { id: "versions", Icon: GitBranch,   label: "Versions" },
  { id: "datasets", Icon: Layers,      label: "Datasets" },
  { id: "models",   Icon: Cpu,         label: "Models"   },
  { id: "database", Icon: Database,    label: "Database" },
  { id: "settings", Icon: Settings,    label: "Settings" },
];


// ─────────────────────────────────────────────────────────────────────────────
// Pinned panels — stacked with resizable divider between them
// ─────────────────────────────────────────────────────────────────────────────
function PinnedPanelCard({
  id, onUnpin, onExpand,
}: { id: SidePanel; onUnpin: (id: SidePanel) => void; onExpand: (id: SidePanel) => void }) {
  return (
    <div className="flex flex-col overflow-hidden min-h-0 flex-1">
      <div className="flex items-center px-3 h-8 shrink-0 border-b"
           style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <Pin className="w-2.5 h-2.5 mr-1.5 fill-current" style={{ color: "var(--accent)" }} />
        <span className="text-[10px] font-semibold capitalize" style={{ color: "var(--accent)" }}>{id}</span>
        <button onClick={() => onExpand(id)} title="Expand to top"
          className="ml-auto mr-1 text-[10px] px-1 py-0.5 rounded transition-colors font-medium"
          style={{ color: "var(--text-faint)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-faint)")}
        >↑</button>
        <button onClick={() => onUnpin(id)} title="Unpin"
          className="p-1 rounded transition-colors"
          style={{ color: "var(--text-faint)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--danger)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-faint)")}
        ><X className="w-3 h-3" /></button>
      </div>
      <div className="flex-1 overflow-hidden min-h-0">
        <PanelContent id={id} />
      </div>
    </div>
  );
}

function PinnedPanelsSection({
  pinnedPanels, onUnpin, onExpand,
}: {
  pinnedPanels: SidePanel[];
  onUnpin: (id: SidePanel) => void;
  onExpand: (id: SidePanel) => void;
}) {
  // vertical resize between the two pinned panels (invert=true: drag up = top panel taller)
  const divider = useResize(160, 60, 340, "v", false);

  if (pinnedPanels.length === 1) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <PinnedPanelCard id={pinnedPanels[0]} onUnpin={onUnpin} onExpand={onExpand} />
      </div>
    );
  }

  // Two pinned panels — top is fixed height, bottom fills rest
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex flex-col overflow-hidden shrink-0" style={{ height: divider.size }}>
        <PinnedPanelCard id={pinnedPanels[0]} onUnpin={onUnpin} onExpand={onExpand} />
      </div>
      <VHandle onMouseDown={divider.onMouseDown} />
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 border-t"
           style={{ borderColor: "var(--border)" }}>
        <PinnedPanelCard id={pinnedPanels[1]} onUnpin={onUnpin} onExpand={onExpand} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Waiting state — shown when datasets are loaded but no AI query has run yet
// ─────────────────────────────────────────────────────────────────────────────
function WaitingForQuery({ datasets }: { datasets: { name: string; rowCount: number; colCount: number }[] }) {
  const suggestions = [
    "What are the top 10 most frequent values in each column?",
    "Show me the distribution grouped by decade",
    "Join both datasets and find the top results",
    "Clean duplicates and normalize the data",
  ];

  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-6 p-10 select-none"
      style={{ background: "var(--bg)" }}
    >
      {/* Loaded datasets pills */}
      <div className="flex flex-wrap gap-2 justify-center">
        {datasets.map((ds) => (
          <div
            key={ds.name}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
            style={{
              background: "white",
              borderColor: "var(--accent-border)",
              boxShadow: "var(--shadow-xs)",
            }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: "var(--success)" }}
            />
            <span className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>
              {ds.name}
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
              {ds.rowCount.toLocaleString()} × {ds.colCount}
            </span>
          </div>
        ))}
      </div>

      {/* Central message */}
      <div className="text-center max-w-sm">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          Ask the AI something to get started
        </p>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
          The result of your query will appear here.
          <br />
          Your raw datasets are visible in the preview below.
        </p>
      </div>

      {/* Suggestion chips */}
      <div className="flex flex-col gap-1.5 w-full max-w-md">
        <p className="text-[9px] font-semibold tracking-wide uppercase text-center mb-1" style={{ color: "var(--text-faint)" }}>
          Try asking…
        </p>
        {suggestions.slice(0, datasets.length >= 2 ? 3 : 2).map((s) => (
          <div
            key={s}
            className="text-[10px] px-3 py-2 rounded-lg border text-center"
            style={{
              borderColor: "var(--border)",
              background: "white",
              color: "var(--text-muted)",
            }}
          >
            "{s}"
          </div>
        ))}
      </div>

      {/* Arrow hinting toward chat */}
      <div className="flex items-center gap-2 mt-2" style={{ color: "var(--text-ghost)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span className="text-[10px]" style={{ color: "var(--text-ghost)" }}>
          Type in the chat on the left
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AppLayout
// ─────────────────────────────────────────────────────────────────────────────
export function AppLayout() {
  const {
    datasetName, profile, versions, activeModelInfo,
    loadedDatasets, addLoadedDataset,
    hasAIResult, currentVersionId,
  } = useAppStore();

  // ── Panel state ──
  // activePanel: currently open (at top of sidebar), not necessarily pinned
  // pinnedPanels: anchored panels shown below, max 2
  const [activePanel,  setActivePanel]  = useState<SidePanel | null>(null);
  const [pinnedPanels, setPinnedPanels] = useState<SidePanel[]>([]);
  const [showDB, setShowDB] = useState(false);
  const [addingFile, setAddingFile] = useState(false);

  // ── Bottom panes ──
  const [bottomPanes, setBottomPanes] = useState<(0 | 1)[]>([]);
  const showBottom = bottomPanes.length > 0;

  // Auto-show bottom panes when first dataset is loaded
  useEffect(() => {
    if (loadedDatasets.length > 0 && bottomPanes.length === 0) {
      setBottomPanes([0]);
    }
    if (loadedDatasets.length >= 2 && bottomPanes.length < 2) {
      setBottomPanes([0, 1]);
    }
  }, [loadedDatasets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open versions panel whenever the AI produces a new result
  useEffect(() => {
    if (hasAIResult) {
      setActivePanel("versions");
    }
  }, [versions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resize handles ──
  // chat: drag right = wider   → invert=false ✓
  const chat       = useResize(260, 180, 460, "h", false);
  // bottom: drag UP = taller   → invert=true
  const bottom     = useResize(230, 100, 420, "v", true);
  // right panel width: drag left = wider → invert=true
  const rightWidth = useResize(292, 220, 420, "h", true);
  // pinned1 height: drag UP = taller (second pinned panel, below divider) → invert=true
  // bottom pane split: drag right = first pane wider → invert=false

  // We'll use a percentage split for bottom panes instead
  const [bottomSplitPct, setBottomSplitPct] = useState(50); // %
  const bottomSplitRef = useRef(50);
  bottomSplitRef.current = bottomSplitPct;

  const onBottomSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = (e.currentTarget as HTMLElement).closest(".bottom-panes-row") as HTMLElement;
    if (!container) return;
    const startX = e.clientX;
    const totalW = container.getBoundingClientRect().width;
    const startPct = bottomSplitRef.current;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const delta = (dx / totalW) * 100;
      setBottomSplitPct(Math.min(80, Math.max(20, startPct + delta)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // ── Sidebar logic ──
  // Clicking an icon:
  //   - if it's the activePanel → close it (set null)
  //   - if it's pinned → unpin it
  //   - otherwise → open as activePanel
  const handleIconClick = (id: SidePanel) => {
    if (id === "database") { setShowDB(true); return; }
    if (id === activePanel) {
      setActivePanel(null);
    } else {
      setActivePanel(id);
    }
  };

  const handlePin = (id: SidePanel) => {
    setPinnedPanels((prev) => {
      if (prev.includes(id)) return prev; // already pinned
      const next = [...prev.filter((p) => p !== id), id].slice(-2); // max 2, newest last
      return next;
    });
  };

  const handleUnpin = (id: SidePanel) => {
    setPinnedPanels((prev) => prev.filter((p) => p !== id));
  };

  // The sidebar shows:
  // 1. activePanel at top (if set and not pinned, or pinned panels exist below it)
  // 2. pinnedPanels stacked at bottom

  const showActiveAtTop = activePanel !== null && !pinnedPanels.includes(activePanel);
  // active panel that is also pinned → just show in pinned section
  const hasPinnedSection = pinnedPanels.length > 0;
  const sidebarVisible = activePanel !== null || pinnedPanels.length > 0;

  // Calculate active panel height when pinned panels exist below
  // use a resizable divider between active and pinned section
  const activePanelH = useResize(200, 100, 400, "v", false);

  // ── Header stats ──
  // Header stats — always reflect the active version, not the raw loaded file
  const activeVersion  = versions.find((v) => v.id === currentVersionId)
    ?? (versions.length > 0 ? versions[versions.length - 1] : null);
  const displayScore   = activeVersion?.qualityScore ?? profile?.qualityScore ?? null;
  const displayRows    = activeVersion?.rowCount ?? profile?.rowCount ?? null;
  const displayCols    = activeVersion?.colCount ?? profile?.colCount ?? null;
  // Label shown next to the logo: result version name when AI has run, else filename
  const headerLabel    = hasAIResult && activeVersion
    ? activeVersion.label
    : datasetName ?? null;

  const handleQuickAdd = async () => {
    const input = document.createElement("input");
    input.type = "file"; input.multiple = true;
    input.accept = ".csv,.json,.parquet,.xlsx,.xls,.tsv,.txt";
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      setAddingFile(true);
      for (const file of files) {
        try {
          const res = await apiAddDataset(file);
          addLoadedDataset({ name: res.name, rowCount: res.rowCount, colCount: res.colCount,
            qualityScore: res.qualityScore, columns: res.columns,
            preview: res.preview?.slice(0, 5) ?? [], isActive: false });
        } catch {}
      }
      setAddingFile(false);
    };
    input.click();
  };

  const addBottomPane = () => {
    if (bottomPanes.length >= 2) return;
    setBottomPanes((prev) => [...prev, prev.length === 0 ? 0 : 1] as (0 | 1)[]);
  };

  const removeBottomPane = (slot: 0 | 1) => {
    setBottomPanes((prev) => {
      const next = prev.filter((s) => s !== slot);
      return next;
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* ── Header ── */}
      <header className="flex items-center px-3 h-10 shrink-0 border-b"
              style={{ borderColor: "var(--border)", background: "white", boxShadow: "var(--shadow-xs)" }}>
        {/* Logo */}
        <div className="flex items-center gap-1.5 mr-3 select-none">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
               style={{ background: "var(--gradient-accent)", boxShadow: "var(--accent-glow-sm)" }}>
            <Hexagon className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[13px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>PureQL</span>
        </div>

        {/* Model pill */}
        {activeModelInfo && (
          <button onClick={() => handleIconClick("models")}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-all duration-150"
            style={{ borderColor: "var(--border)", background: "var(--bg-sunken)" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent-border)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <Zap className="w-2.5 h-2.5" style={{ color: activeModelInfo.type === "local" ? "var(--success)" : "var(--warning)" }} />
            <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
              {activeModelInfo.type === "api" && activeModelInfo.provider
                ? `${activeModelInfo.provider} · ${activeModelInfo.displayName}`
                : activeModelInfo.displayName}
            </span>
            <span className="text-[9px] px-1 rounded-full font-bold"
                  style={{
                    background: activeModelInfo.type === "local" ? "rgba(16,185,129,.12)" : "rgba(245,158,11,.12)",
                    color: activeModelInfo.type === "local" ? "var(--success)" : "var(--warning)"
                  }}>
              {activeModelInfo.type === "local" ? "local" : "cloud"}
            </span>
          </button>
        )}

        {headerLabel && (
          <span className="text-[11px] ml-2 truncate max-w-[200px]" style={{ color: hasAIResult ? "var(--accent)" : "var(--text-faint)" }}>
            — {headerLabel}
          </span>
        )}

        <div className="flex-1" />

        {/* Dynamic score + rows (updates per version) */}
        {displayScore !== null && (
          <div className="flex items-center gap-2 mr-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border"
                 style={{ background: "var(--bg-sunken)", borderColor: "var(--border)" }}>
              <div className="w-1.5 h-1.5 rounded-full transition-colors duration-500"
                   style={{ background: displayScore >= 80 ? "var(--success)" : displayScore >= 60 ? "var(--warning)" : "var(--danger)" }} />
              <span className="text-[10px] font-bold transition-all duration-300"
                    style={{ color: displayScore >= 80 ? "var(--success-dark)" : displayScore >= 60 ? "#b45309" : "var(--danger)" }}>
                {displayScore}/100
              </span>
            </div>
            {displayRows !== null && (
              <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                {displayRows.toLocaleString()} rows × {displayCols} cols
              </span>
            )}
          </div>
        )}

        {/* + Dataset */}
        {datasetName && (
          <button onClick={handleQuickAdd} disabled={addingFile}
            className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-lg border transition-all duration-150 mr-1.5"
            style={{ borderColor: "var(--accent-border)", color: "var(--accent)", background: "var(--accent-subtle)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-muted)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--accent-subtle)")}
          >
            {addingFile
              ? <div className="w-3 h-3 rounded-full animate-spin" style={{ border: "1.5px solid var(--accent)", borderTopColor: "transparent" }} />
              : <Plus className="w-3 h-3" />}
            Dataset
          </button>
        )}

        {/* Preview panes toggle */}
        {loadedDatasets.length > 0 && (
          <button onClick={showBottom ? () => setBottomPanes([]) : addBottomPane}
            className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg border transition-all duration-150"
            style={{
              borderColor: showBottom ? "var(--accent-border)" : "var(--border)",
              color:       showBottom ? "var(--accent)"         : "var(--text-faint)",
              background:  showBottom ? "var(--accent-subtle)"  : "transparent",
            }}>
            <SplitSquareVertical className="w-3.5 h-3.5" />
            {showBottom ? "Hide preview" : "Dataset preview"}
          </button>
        )}
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Chat — resizable right edge, drag right = wider */}
        <div className="flex flex-col shrink-0 overflow-hidden border-r"
             style={{ width: chat.size, borderColor: "var(--border)", background: "white" }}>
          <ChatPanel />
        </div>
        <HHandle onMouseDown={chat.onMouseDown} />

        {/* Center column */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Main result preview (top) */}
          <div className="overflow-hidden min-h-0" style={{ flex: 1 }}>
            {!datasetName
              ? <FileDropZone />
              : !hasAIResult
              ? <WaitingForQuery datasets={loadedDatasets} />
              : <DataPreview />
            }
          </div>

          {/* Bottom panes */}
          {showBottom && (
            <>
              {/* VHandle — drag UP = bottom section taller (invert=true ✓) */}
              <VHandle onMouseDown={bottom.onMouseDown} />

              <div
                className="bottom-panes-row flex overflow-hidden shrink-0"
                style={{ height: bottom.size }}
              >
                {bottomPanes.length === 1 ? (
                  // Single pane — full width
                  <div className="flex-1 overflow-hidden">
                    <MiniPreview slot={bottomPanes[0]} onRemove={() => removeBottomPane(bottomPanes[0])} />
                  </div>
                ) : bottomPanes.length === 2 ? (
                  // Two panes with percentage split + horizontal handle between them
                  <>
                    <div className="overflow-hidden" style={{ width: `${bottomSplitPct}%` }}>
                      <MiniPreview slot={0} onRemove={() => removeBottomPane(0)} />
                    </div>
                    {/* Horizontal divider between bottom panes */}
                    <div
                      onMouseDown={onBottomSplitMouseDown}
                      className="group shrink-0 flex items-center justify-center"
                      style={{ width: 6, cursor: "col-resize", background: "var(--bg-sunken)", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)", position: "relative" }}
                    >
                      <div style={{ position: "absolute", inset: "0 -4px" }} />
                      <div className="flex flex-col gap-0.5 pointer-events-none" style={{ opacity: 0.4 }}>
                        {[0,1,2].map(i => <div key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--text-faint)" }} />)}
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <MiniPreview slot={1} onRemove={() => removeBottomPane(1)} />
                    </div>
                  </>
                ) : null}

                {/* Add second pane button */}
                {bottomPanes.length === 1 && loadedDatasets.length >= 2 && (
                  <button onClick={addBottomPane}
                    className="flex flex-col items-center justify-center gap-1.5 px-4 border-l transition-all duration-200 group shrink-0"
                    style={{ borderColor: "var(--border)", background: "transparent", width: 72 }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-subtle)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <Plus className="w-4 h-4 transition-colors" style={{ color: "var(--text-faint)" }} />
                    <span className="text-[9px] font-medium text-center leading-tight" style={{ color: "var(--text-faint)" }}>Add<br/>pane</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Right side: panels ── */}
        {sidebarVisible && (
          <>
            {/* HHandle — drag LEFT = panel wider (invert=true ✓) */}
            <HHandle onMouseDown={rightWidth.onMouseDown} />

            <div className="flex flex-col shrink-0 overflow-hidden border-l"
                 style={{ width: rightWidth.size, borderColor: "var(--border)", background: "white" }}>

              {/* ── Active panel (top) ── */}
              {showActiveAtTop && (
                <div
                  className="flex flex-col overflow-hidden shrink-0"
                  style={{
                    // if pinned section exists below, use resizable height; else fill
                    flex: hasPinnedSection ? "none" : 1,
                    height: hasPinnedSection ? activePanelH.size : undefined,
                    minHeight: 80,
                    borderBottom: hasPinnedSection ? `1px solid var(--border)` : "none",
                  }}
                >
                  {/* Panel header */}
                  <div className="flex items-center px-3 h-9 shrink-0 border-b"
                       style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                    <span className="text-[11px] font-semibold capitalize" style={{ color: "var(--text-muted)" }}>
                      {activePanel}
                    </span>
                    {/* Pin button */}
                    <button
                      onClick={() => handlePin(activePanel!)}
                      disabled={pinnedPanels.length >= 2}
                      title="Pin this panel"
                      className="ml-2 p-1 rounded transition-colors duration-150 disabled:opacity-30"
                      style={{ color: "var(--text-faint)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--text-faint)")}
                    >
                      <Pin className="w-3 h-3" />
                    </button>
                    <button onClick={() => setActivePanel(null)}
                      className="ml-auto p-1 rounded transition-colors duration-150"
                      style={{ color: "var(--text-faint)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "var(--text-secondary)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--text-faint)")}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <PanelContent id={activePanel!} />
                  </div>
                </div>
              )}

              {/* Resize handle between active and pinned section */}
              {showActiveAtTop && hasPinnedSection && (
                <VHandle onMouseDown={activePanelH.onMouseDown} />
              )}

              {/* ── Pinned panels (bottom, stacked) ── */}
              {hasPinnedSection && (
                <PinnedPanelsSection
                  pinnedPanels={pinnedPanels}
                  onUnpin={handleUnpin}
                  onExpand={(id) => setActivePanel(id)}
                />
              )}


            </div>
          </>
        )}

        {/* ── Icon sidebar ── */}
        <div className="w-10 shrink-0 flex flex-col items-center py-2 gap-1 border-l"
             style={{ borderColor: "var(--border)", background: "var(--bg)" }}>

          {SIDE_ITEMS.filter(i => i.id !== "settings").map(({ id, Icon, label }) => {
            const isActive  = activePanel === id;
            const isPinned  = pinnedPanels.includes(id);

            return (
              <button
                key={id}
                onClick={() => handleIconClick(id)}
                title={label}
                className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150"
                style={{
                  background: isActive || isPinned ? "var(--accent-subtle)" : "transparent",
                  color:      isActive || isPinned ? "var(--accent)"         : "var(--text-faint)",
                  border:     isActive || isPinned ? "1px solid var(--accent-border)" : "1px solid transparent",
                }}
                onMouseEnter={e => { if (!isActive && !isPinned) { e.currentTarget.style.background = "var(--bg-sunken)"; e.currentTarget.style.color = "var(--text-muted)"; }}}
                onMouseLeave={e => { if (!isActive && !isPinned) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-faint)"; }}}
              >
                <Icon className="w-4 h-4" />
                {isPinned && (
                  <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                       style={{ background: "var(--accent)" }} />
                )}
                {id === "versions" && versions.length > 0 && (
                  <div className="absolute -top-0.5 -right-0.5 text-[8px] font-bold rounded-full min-w-[14px] text-center leading-[14px] h-[14px] px-0.5"
                       style={{ background: "var(--gradient-accent)", color: "white" }}>
                    {versions.length}
                  </div>
                )}
                {id === "datasets" && loadedDatasets.length > 0 && (
                  <div className="absolute -top-0.5 -right-0.5 text-[8px] font-bold rounded-full min-w-[14px] text-center leading-[14px] h-[14px] px-0.5"
                       style={{ background: "var(--gradient-accent)", color: "white" }}>
                    {loadedDatasets.length}
                  </div>
                )}
              </button>
            );
          })}

          <div className="flex-1" />

          {/* Collapse hint when nothing open */}
          {!sidebarVisible && (
            <button onClick={() => handleIconClick("versions")} title="Open panel"
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors duration-150"
              style={{ color: "var(--text-faint)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-faint)")}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Settings at the very bottom */}
          <div className="w-full h-px mb-1 mt-1" style={{ background: "var(--border)" }} />
          {(() => {
            const id = "settings" as const;
            const isActive = activePanel === id;
            return (
              <button
                onClick={() => handleIconClick(id)}
                title="Settings"
                className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150"
                style={{
                  background: isActive ? "var(--accent-subtle)" : "transparent",
                  color:      isActive ? "var(--accent)"         : "var(--text-faint)",
                  border:     isActive ? "1px solid var(--accent-border)" : "1px solid transparent",
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "var(--bg-sunken)"; e.currentTarget.style.color = "var(--text-muted)"; }}}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-faint)"; }}}
              >
                <Settings className="w-4 h-4" />
              </button>
            );
          })()}
        </div>
      </div>

      {showDB && <DatabaseModal onClose={() => setShowDB(false)} />}
    </div>
  );
}