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
  Zap, ChevronLeft, Settings, Save, FolderOpen, CheckCircle2,
} from "lucide-react";
import { addDataset as apiAddDataset, saveProject, getDefaultProjectPath } from "../../lib/api";

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
    loadedDatasets, addLoadedDataset, selectedDatasets,
    hasAIResult, currentVersionId,
    projectName, projectPath, projectCreatedAt,
    messages,
    setHasProject, setPreviousProject,
  } = useAppStore();

  // ── Panel state ──
  // activePanel: currently open (at top of sidebar), not necessarily pinned
  // pinnedPanels: anchored panels shown below, max 2
  const [activePanel,  setActivePanel]  = useState<SidePanel | null>(null);
  const [pinnedPanels, setPinnedPanels] = useState<SidePanel[]>([]);
  const [showDB, setShowDB] = useState(false);
  const [addingFile, setAddingFile] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [savedOk, setSavedOk]       = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsInput, setSaveAsInput] = useState("");
  const [saveAsError, setSaveAsError] = useState<string | null>(null);

  // "Back to projects" confirmation modal
  const [backModalOpen, setBackModalOpen] = useState(false);

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

  /** Build the chat payload from store messages */
  const _chatPayload = () =>
    (messages || []).map((m: { id: string; role: string; content: string; timestamp: number }) => ({
      id: m.id, role: m.role, content: m.content, timestamp: m.timestamp,
    }));

  /** Core save — calls Python with a resolved absolute path */
  const _doSave = async (filePath: string) => {
    const name = projectName || "untitled";
    const result = await saveProject({
      path: filePath,
      project_name: name,
      chat_history: _chatPayload(),
      created_at: projectCreatedAt ?? undefined,
    });
    // Persist the path back into the store so subsequent Saves reuse it
    useAppStore.getState().setProjectPath(result.path);
    return result;
  };

  /** Ctrl+S / Save button — saves to existing path or default path */
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavedOk(false);
    try {
      let filePath = projectPath;
      if (!filePath) {
        // Ask Python for the resolved default path (expands ~ server-side)
        const { path } = await getDefaultProjectPath(projectName || "untitled");
        filePath = path;
      }
      await _doSave(filePath);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (err) {
      console.error("Save project failed:", err);
    } finally {
      setSaving(false);
    }
  };

  /** Save As — tries Tauri native dialog, falls back to inline path input */
  const handleSaveAs = async () => {
    // Try Tauri dialog API (available in packaged desktop app)
    try {
      // @ts-ignore — Tauri globals injected at runtime
      const tauriDialog = window.__TAURI__?.dialog ?? window.__TAURI_INVOKE__;
      if (window.__TAURI__) {
        // @ts-ignore
        const { save: tauriSave } = await import("@tauri-apps/plugin-dialog").catch(() => ({}));
        if (tauriSave) {
          const defaultName = projectName
            ? projectName.replace(/[/\\: ]/g, "_") + ".pureql"
            : "untitled.pureql";
          const { path: defaultDir } = await getDefaultProjectPath(projectName || "untitled");
          const chosen = await tauriSave({
            title: "Save PureQL Project",
            defaultPath: defaultDir,
            filters: [{ name: "PureQL Project", extensions: ["pureql"] }],
          });
          if (chosen) {
            setSaving(true);
            try {
              await _doSave(chosen);
              setSavedOk(true);
              setTimeout(() => setSavedOk(false), 2500);
            } finally {
              setSaving(false);
            }
          }
          return;
        }
      }
    } catch {
      // Tauri not available — fall through to inline input
    }

    // Fallback: show inline path input modal
    const { path: defaultPath } = await getDefaultProjectPath(projectName || "untitled");
    setSaveAsInput(defaultPath);
    setSaveAsError(null);
    setSaveAsOpen(true);
  };

  const handleSaveAsConfirm = async () => {
    const p = saveAsInput.trim();
    if (!p) { setSaveAsError("Please enter a valid path."); return; }
    setSaving(true);
    setSaveAsError(null);
    try {
      await _doSave(p.endsWith(".pureql") ? p : p + ".pureql");
      setSaveAsOpen(false);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (err) {
      setSaveAsError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  /** Navigate back to ProjectHub — called from the confirmation modal */
  const handleGoBack = async (shouldSave: boolean) => {
    setBackModalOpen(false);
    if (shouldSave) {
      await handleSave();
    }
    // Store current project so ProjectHub can show "Resume" option
    setPreviousProject({ name: projectName || "Untitled", path: projectPath });
    setHasProject(false);
  };

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

        {/* Back to Projects */}
        <button
          onClick={() => setBackModalOpen(true)}
          title="Back to Projects"
          className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border transition-all duration-150 mr-1 shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--text-ghost)", background: "transparent" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "var(--accent-subtle)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-ghost)"; e.currentTarget.style.background = "transparent"; }}
        >
          <ChevronLeft className="w-3 h-3" />
          Projects
        </button>

        {/* Save + Save As */}
        {projectName && (
          <div className="flex items-center gap-1 ml-1">
            <button
              onClick={handleSave}
              disabled={saving}
              title={projectPath ? `Save to ${projectPath}` : "Save (auto path)"}
              className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-lg border transition-all duration-200"
              style={{
                borderColor: savedOk ? "rgba(16,185,129,0.4)" : "var(--border)",
                color:       savedOk ? "var(--success)"       : "var(--text-faint)",
                background:  savedOk ? "rgba(16,185,129,0.07)": "transparent",
              }}
              onMouseEnter={e => { if (!savedOk && !saving) { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent)"; }}}
              onMouseLeave={e => { if (!savedOk) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-faint)"; }}}
            >
              {saving
                ? <div className="w-3 h-3 rounded-full animate-spin" style={{ border: "1.5px solid var(--text-faint)", borderTopColor: "transparent" }} />
                : savedOk ? <CheckCircle2 className="w-3 h-3" /> : <Save className="w-3 h-3" />}
              {saving ? "Saving…" : savedOk ? "Saved" : "Save"}
            </button>
            <button
              onClick={handleSaveAs}
              disabled={saving}
              title="Save As — choose location"
              className="flex items-center justify-center w-6 h-6 rounded-md border transition-all duration-150"
              style={{ borderColor: "var(--border)", background: "transparent", color: "var(--text-ghost)" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "var(--accent-subtle)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-ghost)"; e.currentTarget.style.background = "transparent"; }}
            >
              <FolderOpen className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Project name + dataset & version count */}
        {projectName && (
          <div className="flex items-center gap-2 ml-3">
            <span className="text-[12px] font-semibold truncate max-w-[160px]"
              style={{ color: "var(--text-primary)" }}>
              {projectName}
            </span>
            <div className="flex items-center gap-1.5">
              {loadedDatasets.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border"
                  style={{ background: "var(--bg-sunken)", borderColor: "var(--border)", color: "var(--text-faint)" }}>
                  <Layers className="w-2.5 h-2.5" />
                  {loadedDatasets.length} dataset{loadedDatasets.length !== 1 ? "s" : ""}
                </span>
              )}
              {versions.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border"
                  style={{ background: "var(--bg-sunken)", borderColor: "var(--border)", color: "var(--text-faint)" }}>
                  <GitBranch className="w-2.5 h-2.5" />
                  {versions.length} version{versions.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex-1" />

        {/* Model pill */}
        {activeModelInfo && (
          <button onClick={() => handleIconClick("models")}
            className="flex items-center gap-1.5 mr-1.5 px-2 py-1 rounded-full border transition-all duration-150"
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

      {/* ── Save As modal (fallback for non-Tauri env) ── */}
      {saveAsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setSaveAsOpen(false); }}
        >
          <div
            className="w-full max-w-md mx-4 rounded-2xl p-6 shadow-2xl"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}>
                  <FolderOpen className="w-4 h-4" style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Save As</div>
                  <div className="text-[10px]" style={{ color: "var(--text-ghost)" }}>Choose where to save your project</div>
                </div>
              </div>
              <button
                onClick={() => setSaveAsOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ color: "var(--text-faint)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--bg-sunken)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Path input */}
            <div className="mb-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wide mb-1.5"
                style={{ color: "var(--text-faint)" }}>
                File path
              </label>
              <input
                type="text"
                value={saveAsInput}
                onChange={e => { setSaveAsInput(e.target.value); setSaveAsError(null); }}
                onKeyDown={e => { if (e.key === "Enter") handleSaveAsConfirm(); if (e.key === "Escape") setSaveAsOpen(false); }}
                autoFocus
                placeholder="/Users/you/Documents/PureQL/my-project.pureql"
                className="w-full px-3 py-2.5 rounded-xl text-xs font-mono outline-none transition-all"
                style={{
                  background: "var(--bg-sunken)",
                  border: `1px solid ${saveAsError ? "rgba(239,68,68,0.5)" : "var(--border)"}`,
                  color: "var(--text-primary)",
                  fontFamily: "monospace",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(14,165,233,0.08)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = saveAsError ? "rgba(239,68,68,0.5)" : "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
              />
              {saveAsError && (
                <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: "var(--danger)" }}>
                  <span>⚠</span> {saveAsError}
                </p>
              )}
              {!saveAsError && (
                <p className="text-[10px] mt-1.5" style={{ color: "var(--text-ghost)" }}>
                  Extension <code className="font-mono">.pureql</code> added automatically if omitted.
                </p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setSaveAsOpen(false)}
                className="btn-ghost flex-1 justify-center"
                style={{ padding: "0.55rem" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAsConfirm}
                disabled={saving || !saveAsInput.trim()}
                className="btn-primary flex-[2] justify-center"
                style={{
                  background: saving || !saveAsInput.trim() ? "var(--bg-sunken)" : "var(--gradient-accent)",
                  boxShadow: saving || !saveAsInput.trim() ? "none" : "var(--accent-glow-sm)",
                  color: saving || !saveAsInput.trim() ? "var(--text-ghost)" : "white",
                  padding: "0.55rem",
                  cursor: saving || !saveAsInput.trim() ? "not-allowed" : "pointer",
                }}
              >
                {saving
                  ? <><div className="w-3 h-3 rounded-full animate-spin mr-1.5" style={{ border: "1.5px solid white", borderTopColor: "transparent" }} />Saving…</>
                  : <><Save className="w-3.5 h-3.5" />Save here</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Back to Projects confirmation modal ── */}
      {backModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(6px)" }}
          onClick={e => { if (e.target === e.currentTarget) setBackModalOpen(false); }}
        >
          <div
            className="w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl animate-fade-up"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}
          >
            {/* Top accent strip */}
            <div className="h-1 w-full" style={{ background: "var(--gradient-accent)" }} />

            <div className="p-6">
              {/* Icon + title */}
              <div className="flex items-start gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}>
                  <ChevronLeft className="w-5 h-5" style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <div className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                    Back to Projects?
                  </div>
                  <div className="text-xs leading-relaxed" style={{ color: "var(--text-faint)" }}>
                    {projectName
                      ? <>You're leaving <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>"{projectName}"</span>. Save your progress before going back?</>
                      : "Do you want to save your progress before going back?"}
                  </div>
                </div>
              </div>

              {/* Show current save path if known */}
              {projectPath && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl mb-5 text-[10px] font-mono truncate"
                  style={{ background: "var(--bg-sunken)", border: "1px solid var(--border)", color: "var(--text-ghost)" }}
                >
                  <Save className="w-3 h-3 shrink-0" style={{ color: "var(--text-faint)" }} />
                  <span className="truncate">{projectPath}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {/* Save & leave — primary */}
                <button
                  onClick={() => handleGoBack(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-150"
                  style={{ background: "var(--gradient-accent)", color: "white", boxShadow: "var(--accent-glow-sm)" }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--accent-glow-md)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = "var(--accent-glow-sm)"; e.currentTarget.style.transform = "none"; }}
                >
                  <Save className="w-3.5 h-3.5" />
                  Save & go back
                </button>

                {/* Leave without saving */}
                <button
                  onClick={() => handleGoBack(false)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-150"
                  style={{ background: "var(--bg-raised)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; e.currentTarget.style.color = "var(--danger)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >
                  Leave without saving
                </button>

                {/* Cancel — stay */}
                <button
                  onClick={() => setBackModalOpen(false)}
                  className="w-full py-2 text-xs transition-colors duration-150"
                  style={{ color: "var(--text-ghost)" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "var(--text-faint)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--text-ghost)"; }}
                >
                  Cancel — stay here
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* ── Footer ── */}
      {loadedDatasets.length > 0 && (() => {
        // Datasets to display: selected ones, or fallback to active dataset
        const footerDatasets = selectedDatasets.length > 0
          ? loadedDatasets.filter(ds => selectedDatasets.includes(ds.name))
          : loadedDatasets.filter(ds => ds.name === datasetName).slice(0, 1);

        if (footerDatasets.length === 0) return null;

        const scoreColor = (s: number) =>
          s >= 80 ? "var(--success-dark)" : s >= 60 ? "#b45309" : "var(--danger)";
        const scoreDot = (s: number) =>
          s >= 80 ? "var(--success)" : s >= 60 ? "var(--warning)" : "var(--danger)";

        return (
          <footer
            className="flex items-center px-4 h-6 shrink-0 border-t gap-0 select-none overflow-x-auto"
            style={{ borderColor: "var(--border)", background: "var(--bg-sunken)" }}
          >
            {footerDatasets.map((ds, i) => (
              <div key={ds.name} className="flex items-center gap-0 shrink-0">
                {/* Separator between datasets */}
                {i > 0 && (
                  <div className="w-px h-3 mx-3 shrink-0" style={{ background: "var(--border-strong)" }} />
                )}

                {/* Name */}
                <span className="flex items-center gap-1.5 text-[10px] mr-2" style={{ color: "var(--text-faint)" }}>
                  <Layers className="w-2.5 h-2.5 shrink-0" />
                  <span className="font-mono truncate max-w-[180px]">{ds.name}</span>
                </span>

                {/* Score */}
                <span className="flex items-center gap-1 text-[10px] mr-2">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: scoreDot(ds.qualityScore) }} />
                  <span className="font-bold tabular-nums" style={{ color: scoreColor(ds.qualityScore) }}>
                    {ds.qualityScore}/100
                  </span>
                </span>

                {/* Rows × cols */}
                <span className="text-[10px] font-mono tabular-nums" style={{ color: "var(--text-ghost)" }}>
                  {ds.rowCount.toLocaleString()} rows × {ds.colCount} cols
                </span>
              </div>
            ))}

            {/* Active version label — shown after the datasets */}
            {hasAIResult && activeVersion && (
              <>
                <div className="w-px h-3 mx-3 shrink-0" style={{ background: "var(--border-strong)" }} />
                <span className="text-[10px] truncate max-w-[160px]" style={{ color: "var(--accent)" }}>
                  {activeVersion.label}
                </span>
              </>
            )}

            <div className="flex-1" />

            {/* Version count */}
            {versions.length > 0 && (
              <span className="text-[10px] shrink-0" style={{ color: "var(--text-ghost)" }}>
                v{versions.length}
              </span>
            )}
          </footer>
        );
      })()}
    </div>
  );
}