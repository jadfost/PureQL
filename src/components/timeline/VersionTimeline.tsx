import { useAppStore } from "../../stores/appStore";

export function VersionTimeline() {
  const { versions, currentVersion, setCurrentVersion } = useAppStore();

  return (
    <div className="flex items-center h-full px-3 gap-2 overflow-x-auto">
      <span className="text-[9px] font-semibold text-zinc-600 tracking-wide shrink-0">
        VERSIONS:
      </span>
      {versions.length === 0 && (
        <span className="text-[10px] text-zinc-600">
          No versions yet — changes will appear here
        </span>
      )}
      {versions.map((v, i) => (
        <div key={v.id} className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setCurrentVersion(v.id)}
            className={`text-[9px] px-2 py-0.5 rounded transition ${
              currentVersion === v.id
                ? "bg-pureql-accent-dim text-pureql-accent border border-pureql-accent/30"
                : "text-zinc-500 border border-pureql-border hover:text-zinc-400"
            }`}
          >
            {v.label}
          </button>
          {i < versions.length - 1 && (
            <span className="text-zinc-600 text-[8px]">→</span>
          )}
        </div>
      ))}
    </div>
  );
}
