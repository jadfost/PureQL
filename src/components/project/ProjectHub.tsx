import { useState, useEffect, useRef, useCallback } from "react";
import {
  Hexagon, Plus, FolderOpen, Clock, ChevronRight, X,
  Layers, Database, GitBranch, Upload, AlertTriangle,
  CheckCircle2, Loader2, FileArchive, Trash2, ArrowRight,
  Sparkles,
} from "lucide-react";
import {
  getRecentProjects, loadProject, newProject, removeRecentProject,
  type RecentProject, type ProjectLoadResult,
} from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import type { ProfileData, VersionData } from "../../lib/api";

// ── Resume banner ─────────────────────────────────────────────────────────────

function ResumeBanner({ name, onResume }: { name: string; onResume: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onResume}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl mb-3 transition-all duration-150"
      style={{
        background: hovered ? "var(--bg-raised)" : "var(--bg-sunken)",
        border: `1px solid ${hovered ? "var(--accent-border)" : "var(--border-strong)"}`,
        boxShadow: hovered ? "0 0 0 3px rgba(14,165,233,0.07)" : "none",
      }}
    >
      {/* Pulsing dot */}
      <div className="relative shrink-0">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--accent)" }} />
        <div className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: "var(--accent)" }} />
      </div>

      <div className="flex-1 text-left min-w-0">
        <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          Resume current project
        </div>
        <div className="text-[11px] truncate" style={{ color: "var(--text-ghost)" }}>
          {name}
        </div>
      </div>

      <ChevronRight
        className="w-4 h-4 shrink-0 transition-transform duration-150"
        style={{ color: "var(--text-faint)", transform: hovered ? "translateX(2px)" : "none" }}
      />
    </button>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onOpenApp: (project?: {
    name: string;
    path: string;
    createdAt: number;
    loadResult?: ProjectLoadResult;
  }) => void;
  /** Opens the setup wizard from within the hub */
  onOpenSetup?: () => void;
}

type Screen = "hub" | "new" | "loading";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatSize(bytes?: number): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Orb background (matches Onboarding style) ─────────────────────────────────

const ORBS = [
  { size: 400, top: "-100px", left: "-80px", opacity: 0.25, duration: "11s", delay: "0s",   color: "var(--accent)" },
  { size: 280, bottom: "0px", right: "-60px", opacity: 0.20, duration: "14s", delay: "3s",  color: "var(--accent2)" },
  { size: 200, top: "40%",   left: "50%",    opacity: 0.15, duration: "8s",  delay: "1s",   color: "var(--accent-light)" },
];

function OrbLayer() {
  return (
    <>
      {ORBS.map((orb, i) => (
        <div key={i} className="onboarding-orb" style={{
          width: orb.size, height: orb.size,
          top: (orb as { top?: string }).top,
          left: (orb as { left?: string }).left,
          right: (orb as { right?: string }).right,
          bottom: (orb as { bottom?: string }).bottom,
          background: `radial-gradient(circle, ${orb.color}, transparent 65%)`,
          "--orb-opacity": orb.opacity,
          "--orb-duration": orb.duration,
          "--orb-delay": orb.delay,
        } as React.CSSProperties} />
      ))}
    </>
  );
}

// ── New Project form ──────────────────────────────────────────────────────────

function NewProjectScreen({
  onBack,
  onConfirm,
}: {
  onBack: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const canCreate = name.trim().length > 0;

  return (
    <div className="flex flex-col items-center text-center animate-fade-up w-full max-w-sm">
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 relative"
        style={{ background: "var(--gradient-accent)", boxShadow: "var(--accent-glow-md)" }}>
        <Plus className="w-8 h-8 text-white" strokeWidth={2} />
        <div className="absolute -inset-3 rounded-3xl -z-10"
          style={{ background: "var(--gradient-accent)", opacity: 0.12, filter: "blur(16px)" }} />
      </div>

      <h2 className="text-2xl font-bold mb-2" style={{
        background: "linear-gradient(135deg, var(--accent-deeper), var(--accent), var(--accent2))",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
      }}>
        New project
      </h2>
      <p className="text-sm mb-8" style={{ color: "var(--text-faint)" }}>
        Give your project a name. You can always rename it later.
      </p>

      {/* Name input */}
      <div className="w-full mb-6">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && canCreate) onConfirm(name.trim()); }}
          placeholder="My project"
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            fontFamily: "inherit",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(14,165,233,0.1)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
        />
      </div>

      <div className="flex items-center gap-3 w-full">
        <button
          onClick={onBack}
          className="btn-ghost flex-1 justify-center"
          style={{ padding: "0.65rem" }}
        >
          Back
        </button>
        <button
          onClick={() => canCreate && onConfirm(name.trim())}
          disabled={!canCreate}
          className="btn-primary flex-[2] justify-center"
          style={{
            background: canCreate ? "var(--gradient-accent)" : "var(--bg-sunken)",
            boxShadow: canCreate ? "var(--accent-glow-sm)" : "none",
            color: canCreate ? "white" : "var(--text-ghost)",
            cursor: canCreate ? "pointer" : "not-allowed",
            padding: "0.65rem",
          }}
        >
          Create project <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Loading screen ────────────────────────────────────────────────────────────

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center text-center animate-fade-up">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
        style={{ background: "var(--bg-raised)", border: "1px solid var(--accent-border)" }}>
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: "var(--accent)" }} />
      </div>
      <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{label}</p>
      <div className="mt-4 rounded-full overflow-hidden" style={{ width: 120, height: 2, background: "var(--border)" }}>
        <div className="h-full rounded-full"
          style={{ width: "45%", background: "linear-gradient(90deg, transparent, var(--accent), transparent)", animation: "shimmer 1.2s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

// ── Recent project card ───────────────────────────────────────────────────────

function RecentCard({
  project,
  onOpen,
  onRemove,
}: {
  project: RecentProject;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRemoving(true);
    onRemove();
  };

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative flex items-center gap-4 px-4 py-3.5 rounded-xl cursor-pointer transition-all duration-150"
      style={{
        background: hovered ? "var(--bg-raised)" : "transparent",
        border: `1px solid ${hovered ? "var(--accent-border)" : "var(--border)"}`,
        opacity: removing ? 0.4 : 1,
      }}
    >
      {/* File icon */}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)" }}>
        <FileArchive className="w-5 h-5" style={{ color: "var(--accent)" }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {project.name}
        </div>
        <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-ghost)" }}>
          {project.path}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
            <Clock className="w-3 h-3" />{formatDate(project.modified_at)}
          </span>
          {project.dataset_count > 0 && (
            <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
              <Database className="w-3 h-3" />{project.dataset_count} dataset{project.dataset_count !== 1 ? "s" : ""}
            </span>
          )}
          {project.version_count > 0 && (
            <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
              <GitBranch className="w-3 h-3" />{project.version_count} version{project.version_count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {hovered && (
          <button
            onClick={handleRemove}
            title="Remove from recent"
            className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "var(--bg-sunken)", border: "1px solid var(--border)" }}
          >
            <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--text-faint)" }} />
          </button>
        )}
        <ChevronRight className="w-4 h-4 transition-transform duration-150"
          style={{ color: "var(--text-ghost)", transform: hovered ? "translateX(2px)" : "none" }} />
      </div>
    </div>
  );
}

// ── Import drop zone ──────────────────────────────────────────────────────────

function ImportZone({ onFile }: { onFile: (path: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".pureql")) {
      // In Tauri we'd get the path; in dev browser we simulate with file.name
      onFile((file as File & { path?: string }).path ?? file.name);
    }
  }, [onFile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFile((file as File & { path?: string }).path ?? file.name);
    }
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className="flex flex-col items-center justify-center gap-2 px-6 py-5 rounded-xl cursor-pointer transition-all duration-200"
      style={{
        border: `1.5px dashed ${dragging ? "var(--accent)" : "var(--border-strong)"}`,
        background: dragging ? "var(--accent-muted)" : "transparent",
        boxShadow: dragging ? "0 0 0 3px rgba(14,165,233,0.08)" : "none",
      }}
    >
      <input ref={inputRef} type="file" accept=".pureql" className="hidden" onChange={handleChange} />
      <Upload className="w-5 h-5" style={{ color: dragging ? "var(--accent)" : "var(--text-faint)" }} />
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: dragging ? "var(--accent)" : "var(--text-secondary)" }}>
          Drop a .pureql file here
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-ghost)" }}>
          or click to browse
        </p>
      </div>
    </div>
  );
}

// ── Main Hub screen ───────────────────────────────────────────────────────────

function HubScreen({
  recents,
  loading,
  error,
  previousProject,
  onResume,
  onNewProject,
  onOpenRecent,
  onRemoveRecent,
  onImport,
  onOpenSetup,
}: {
  recents: RecentProject[];
  loading: boolean;
  error: string | null;
  previousProject: { name: string; path: string | null } | null;
  onResume: () => void;
  onNewProject: () => void;
  onOpenRecent: (p: RecentProject) => void;
  onRemoveRecent: (p: RecentProject) => void;
  onImport: (path: string) => void;
  onOpenSetup?: () => void;
}) {
  const hasRecents = recents.length > 0;

  return (
    <div className="w-full max-w-lg animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "var(--gradient-accent)", boxShadow: "var(--accent-glow-sm)" }}>
          <Hexagon className="w-5 h-5 text-white" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>PureQL</h1>
          <p className="text-xs" style={{ color: "var(--text-ghost)" }}>Pure data. Pure queries. Pure local.</p>
        </div>
      </div>

      {/* Resume current project — shown when coming back from an active session */}
      {previousProject && (
        <ResumeBanner name={previousProject.name} onResume={onResume} />
      )}

      {/* Primary action */}
      <button
        onClick={onNewProject}
        className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl mb-6 transition-all duration-150 group"
        style={{
          background: "var(--gradient-accent)",
          boxShadow: "var(--accent-glow-sm)",
        }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--accent-glow-md)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = "var(--accent-glow-sm)"; e.currentTarget.style.transform = "none"; }}
      >
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1 text-left">
          <div className="text-sm font-bold text-white">New project</div>
          <div className="text-[11px] text-white/70">Start fresh with a blank workspace</div>
        </div>
        <ArrowRight className="w-4 h-4 text-white/80 group-hover:translate-x-0.5 transition-transform" />
      </button>

      {/* Recent projects */}
      <div className="card overflow-hidden mb-4">
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <Clock className="w-3.5 h-3.5" style={{ color: "var(--text-faint)" }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Recent projects
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--text-ghost)" }} />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 px-4 py-6">
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "var(--warning)" }} />
            <p className="text-xs" style={{ color: "var(--text-faint)" }}>{error}</p>
          </div>
        ) : !hasRecents ? (
          <div className="flex flex-col items-center py-10 gap-2">
            <Layers className="w-8 h-8 mb-1" style={{ color: "var(--border-strong)" }} />
            <p className="text-sm" style={{ color: "var(--text-faint)" }}>No recent projects</p>
            <p className="text-xs" style={{ color: "var(--text-ghost)" }}>
              Create a project or import a .pureql file below
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {recents.map((p) => (
              <RecentCard
                key={p.path}
                project={p}
                onOpen={() => onOpenRecent(p)}
                onRemove={() => onRemoveRecent(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Import */}
      <ImportZone onFile={onImport} />

      {/* Setup wizard shortcut */}
      {onOpenSetup && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={onOpenSetup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-150"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-faint)",
              fontSize: "11px",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "var(--accent-border)";
              e.currentTarget.style.color = "var(--accent)";
              e.currentTarget.style.background = "var(--accent-muted)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-faint)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Sparkles className="w-3 h-3" />
            AI &amp; Setup wizard
          </button>
        </div>
      )}
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export function ProjectHub({ onOpenApp, onOpenSetup }: Props) {
  const {
    setProjectName, setProjectPath, setProjectCreatedAt,
    setHasProject, previousProject, setPreviousProject,
    setLoadedDatasets, setProfile, setPreviewData,
    setVersions, setCurrentVersionId, clearMessages,
    setDatasetName, setHasAIResult, setCurrentSQL,
  } = useAppStore();
  const [screen, setScreen] = useState<Screen>("hub");
  const [loadingLabel, setLoadingLabel] = useState("Loading project…");
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [recentsLoading, setRecentsLoading] = useState(true);
  const [recentsError, setRecentsError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Load recents on mount
  useEffect(() => {
    getRecentProjects()
      .then(r => { setRecents(r.projects); setRecentsLoading(false); })
      .catch(() => { setRecentsError("Could not load recent projects."); setRecentsLoading(false); });
  }, []);

  const handleResume = () => {
    // Simply go back into the app — state is already in the store
    setPreviousProject(null);
    setHasProject(true);
  };

  const handleNewProject = () => setScreen("new");

  /** Wipe all session data from the Zustand store so a new project starts blank. */
  const resetFrontendStore = () => {
    setLoadedDatasets([]);
    setProfile(null);
    setPreviewData([]);
    setVersions([]);
    setCurrentVersionId(null);
    clearMessages();
    setDatasetName(null);
    setHasAIResult(false);
    setCurrentSQL(null);
  };

  const handleConfirmNew = async (name: string) => {
    setLoadingLabel("Creating project…");
    setScreen("loading");
    try {
      await newProject();          // reset Python backend state
      resetFrontendStore();        // reset React/Zustand frontend state
      const createdAt = Date.now() / 1000;
      setProjectName(name);
      setProjectPath(null);
      setProjectCreatedAt(createdAt);
      setPreviousProject(null);
      setHasProject(true);
      onOpenApp({ name, path: "", createdAt });
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Failed to create project");
      setScreen("hub");
    }
  };

  const handleOpenRecent = async (project: RecentProject) => {
    setLoadingLabel(`Opening "${project.name}"…`);
    setScreen("loading");
    setGlobalError(null);
    try {
      const result = await loadProject(project.path);
      setProjectName(result.meta.name || project.name);
      setProjectPath(project.path);
      setProjectCreatedAt(result.meta.created_at);
      setPreviousProject(null);  // clear resume banner
      setHasProject(true);
      onOpenApp({
        name: result.meta.name || project.name,
        path: project.path,
        createdAt: result.meta.created_at,
        loadResult: result,
      });
    } catch (err) {
      setGlobalError(`Could not open "${project.name}". The file may have been moved or deleted.`);
      setScreen("hub");
      // Remove from recents if file missing
      await removeRecentProject(project.path);
      setRecents(prev => prev.filter(r => r.path !== project.path));
    }
  };

  const handleRemoveRecent = async (project: RecentProject) => {
    await removeRecentProject(project.path);
    setRecents(prev => prev.filter(r => r.path !== project.path));
  };

  const handleImport = async (path: string) => {
    setLoadingLabel("Importing project…");
    setScreen("loading");
    setGlobalError(null);
    try {
      const result = await loadProject(path);
      const name = result.meta.name || path.split("/").pop()?.replace(".pureql", "") || "Project";
      setProjectName(name);
      setProjectPath(path);
      setProjectCreatedAt(result.meta.created_at);
      setHasProject(true);
      onOpenApp({ name, path, createdAt: result.meta.created_at, loadResult: result });
    } catch (err) {
      setGlobalError(`Could not import this file: ${err instanceof Error ? err.message : "Unknown error"}`);
      setScreen("hub");
    }
  };

  return (
    <div className="onboarding-bg h-screen flex flex-col overflow-hidden" style={{ userSelect: "none" }}>
      <OrbLayer />
      <div data-tauri-drag-region className="h-8 w-full shrink-0 relative z-10" />

      {/* Global error toast */}
      {globalError && (
        <div
          className="absolute top-10 left-1/2 -translate-x-1/2 z-50 flex items-start gap-2 px-4 py-3 rounded-xl max-w-sm animate-fade-up"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--danger)" }} />
          <p className="text-xs leading-relaxed flex-1" style={{ color: "var(--text-secondary)" }}>{globalError}</p>
          <button onClick={() => setGlobalError(null)} className="shrink-0 ml-1">
            <X className="w-3.5 h-3.5" style={{ color: "var(--text-faint)" }} />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-8 relative z-10 overflow-y-auto">
        {screen === "hub" && (
          <HubScreen
            recents={recents}
            loading={recentsLoading}
            error={recentsError}
            previousProject={previousProject}
            onResume={handleResume}
            onNewProject={handleNewProject}
            onOpenRecent={handleOpenRecent}
            onRemoveRecent={handleRemoveRecent}
            onImport={handleImport}
            onOpenSetup={onOpenSetup}
          />
        )}

        {screen === "new" && (
          <NewProjectScreen
            onBack={() => setScreen("hub")}
            onConfirm={handleConfirmNew}
          />
        )}

        {screen === "loading" && <LoadingScreen label={loadingLabel} />}
      </div>

      {/* Footer */}
      <div className="flex justify-center pb-6 relative z-10">
        <p className="text-[10px] font-mono" style={{ color: "var(--text-ghost)" }}>
          PureQL · v0.1 · 100% local
        </p>
      </div>
    </div>
  );
}