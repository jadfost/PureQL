import { useAppStore } from "../../stores/appStore";
import {
  undo as apiUndo,
  redo as apiRedo,
  checkout as apiCheckout,
} from "../../lib/api";
import {
  Undo2,
  Redo2,
  GitBranch,
  Clock,
  CheckCircle2,
  ChevronRight,
  Database,
  Sparkles,
  Filter,
  Columns,
  Wand2,
} from "lucide-react";

const ACTION_ICONS: Record<string, React.ElementType> = {
  deduplicate: GitBranch,
  filter: Filter,
  normalize: Wand2,
  add_column: Columns,
  impute: Sparkles,
  default: Database,
};

function getIcon(label: string): React.ElementType {
  const lower = label.toLowerCase();
  for (const key of Object.keys(ACTION_ICONS)) {
    if (lower.includes(key)) return ACTION_ICONS[key];
  }
  return ACTION_ICONS.default;
}

function formatStorage(bytes?: number) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VersionPanel() {
  const {
    versions,
    currentVersionId,
    setPreviewData,
    setVersions,
    setCurrentVersionId,
    setLoading,
  } = useAppStore();

  const handleUndo = async () => {
    setLoading(true);
    try {
      const res = await apiUndo();
      if (res.success && res.preview && res.versions) {
        setPreviewData(res.preview);
        setVersions(res.versions);
        if (res.currentId) setCurrentVersionId(res.currentId);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRedo = async () => {
    setLoading(true);
    try {
      const res = await apiRedo();
      if (res.success && res.preview && res.versions) {
        setPreviewData(res.preview);
        setVersions(res.versions);
        if (res.currentId) setCurrentVersionId(res.currentId);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (versionId: string) => {
    setLoading(true);
    try {
      const res = await apiCheckout(versionId);
      if (res.success) {
        setPreviewData(res.preview);
        setVersions(res.versions);
        setCurrentVersionId(res.currentId);
      }
    } finally {
      setLoading(false);
    }
  };

  const currentIndex = versions.findIndex((v) => v.id === currentVersionId);

  if (versions.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-6 text-center">
        <div className="w-10 h-10 rounded-xl bg-pureql-panel border border-pureql-border flex items-center justify-center">
          <GitBranch className="w-5 h-5 text-zinc-400" />
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">No versions yet</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">
            Each action you take will create a version you can restore here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-pureql-border shrink-0">
        <button
          onClick={handleUndo}
          disabled={currentIndex <= 0}
          title="Undo (Ctrl+Z)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-zinc-500 hover:text-zinc-700 hover:bg-pureql-panel border border-transparent hover:border-pureql-border disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <Undo2 className="w-3.5 h-3.5" />
          Undo
        </button>
        <button
          onClick={handleRedo}
          disabled={currentIndex >= versions.length - 1}
          title="Redo (Ctrl+Shift+Z)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-zinc-500 hover:text-zinc-700 hover:bg-pureql-panel border border-transparent hover:border-pureql-border disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <Redo2 className="w-3.5 h-3.5" />
          Redo
        </button>
        <div className="ml-auto text-[10px] text-zinc-400 font-mono">
          {currentIndex + 1}/{versions.length}
        </div>
      </div>

      {/* Version List */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {/* Reverse so newest is on top */}
        {[...versions].reverse().map((v, reversedIdx) => {
          const originalIdx = versions.length - 1 - reversedIdx;
          const isActive = v.id === currentVersionId;
          const isFuture = originalIdx > currentIndex;
          const Icon = getIcon(v.label);

          return (
            <div key={v.id} className="relative">
              {/* Connector line */}
              {reversedIdx < versions.length - 1 && (
                <div className="absolute left-[22px] top-[42px] bottom-0 w-px bg-pureql-border" />
              )}

              <button
                onClick={() => handleCheckout(v.id)}
                className={`relative w-full flex gap-3 px-2 py-2.5 rounded-lg text-left transition group mb-0.5 ${
                  isActive
                    ? "bg-sky-50 border border-sky-200"
                    : isFuture
                    ? "opacity-40 hover:opacity-70 hover:bg-pureql-panel border border-transparent"
                    : "hover:bg-pureql-panel border border-transparent"
                }`}
              >
                {/* Icon bubble */}
                <div
                  className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 ${
                    isActive
                      ? "bg-pureql-accent text-white"
                      : "bg-pureql-panel text-zinc-400 group-hover:text-zinc-600"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-bold font-mono ${
                        isActive ? "text-pureql-accent" : "text-zinc-400"
                      }`}
                    >
                      {v.label}
                    </span>
                    {isActive && (
                      <CheckCircle2 className="w-3 h-3 text-pureql-accent shrink-0" />
                    )}
                  </div>
                  <p
                    className={`text-[11px] font-medium leading-tight mt-0.5 truncate ${
                      isActive ? "text-zinc-700" : "text-zinc-500"
                    }`}
                  >
                    {v.description || v.label}
                  </p>

                  {/* Meta row */}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {v.rowCount != null && (
                      <span className="flex items-center gap-0.5 text-[9px] text-zinc-400">
                        <Database className="w-2.5 h-2.5" />
                        {v.rowCount.toLocaleString()} rows
                      </span>
                    )}
                    {v.storageBytes != null && (
                      <span className="flex items-center gap-0.5 text-[9px] text-zinc-400">
                        <ChevronRight className="w-2.5 h-2.5" />
                        +{formatStorage(v.storageBytes)}
                      </span>
                    )}
                    {v.qualityScore != null && (
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                          v.qualityScore >= 80
                            ? "bg-emerald-50 text-emerald-600"
                            : v.qualityScore >= 60
                            ? "bg-amber-50 text-amber-600"
                            : "bg-red-50 text-red-500"
                        }`}
                      >
                        {v.qualityScore}/100
                      </span>
                    )}
                    {v.timestamp && (
                      <span className="flex items-center gap-0.5 text-[9px] text-zinc-400">
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(v.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}