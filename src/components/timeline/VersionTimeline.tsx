import { useAppStore } from "../../stores/appStore";
import { undo as apiUndo, redo as apiRedo, checkout as apiCheckout } from "../../lib/api";

export function VersionTimeline() {
  const {
    versions, currentVersionId, setPreviewData,
    setVersions, setCurrentVersionId, setLoading,
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

  return (
    <div className="flex items-center h-full px-3 gap-2 overflow-x-auto">
      {/* Undo/Redo */}
      <button
        onClick={handleUndo}
        className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded hover:bg-pureql-card transition shrink-0"
        title="Undo (Ctrl+Z)"
      >
        ↩
      </button>
      <button
        onClick={handleRedo}
        className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded hover:bg-pureql-card transition shrink-0"
        title="Redo (Ctrl+Shift+Z)"
      >
        ↪
      </button>

      <div className="w-px h-4 bg-pureql-border shrink-0" />

      <span className="text-[9px] font-semibold text-zinc-600 tracking-wide shrink-0">
        VERSIONS:
      </span>

      {versions.map((v, i) => (
        <div key={v.id} className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => handleCheckout(v.id)}
            title={v.description}
            className={`text-[9px] px-2 py-0.5 rounded transition ${
              currentVersionId === v.id
                ? "bg-pureql-accent-dim text-pureql-accent border border-pureql-accent/30"
                : "text-zinc-500 border border-pureql-border hover:text-zinc-400 hover:border-zinc-600"
            }`}
          >
            {v.label}
          </button>
          {i < versions.length - 1 && (
            <span className="text-zinc-700 text-[8px]">→</span>
          )}
        </div>
      ))}
    </div>
  );
}
