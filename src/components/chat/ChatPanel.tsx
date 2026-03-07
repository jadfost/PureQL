import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../../stores/appStore";
import { autoClean } from "../../lib/api";
import {
  MessageSquare, ArrowUp, Check, Sparkles, Square,
  Layers, X, ChevronDown, ChevronUp,
} from "lucide-react";

const BRIDGE = "http://127.0.0.1:9741";

export function ChatPanel() {
  const [input, setInput] = useState("");
  const [showDatasetPicker, setShowDatasetPicker] = useState(false);
  const {
    messages, addMessage, updateMessage,
    setPreviewData, setVersions,
    setProfile, isLoading, setLoading, setCurrentSQL,
    datasetName, loadedDatasets,
    selectedDatasets, toggleSelectedDataset,
    setHasAIResult,
  } = useAppStore();

  const endRef        = useRef<HTMLDivElement>(null);
  const abortRef      = useRef<AbortController | null>(null);
  const streamingId   = useRef<string | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");

    addMessage({ id: crypto.randomUUID(), role: "user", content: text, timestamp: Date.now() });
    setLoading(true);

    const assistantId = crypto.randomUUID();
    streamingId.current = assistantId;
    addMessage({ id: assistantId, role: "assistant", content: "", timestamp: Date.now(), streaming: true });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`${BRIDGE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          datasets: selectedDatasets.length > 0 ? selectedDatasets : (datasetName ? [datasetName] : []),
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";
      let displayed = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));

          if (payload.type === "token") {
            displayed += payload.text;
            const visible = displayed.startsWith("{") ? "Thinking…" : displayed;
            updateMessage(assistantId, { content: visible, streaming: true });

          } else if (payload.type === "done") {
            for (const r of (payload.results ?? [])) {
              if (r.sql) setCurrentSQL(r.sql);
            }
            // Always update preview when the server sends one
            if (payload.preview !== undefined) setPreviewData(payload.preview);
            if (payload.versions?.length)      setVersions(payload.versions);
            // Refresh profile if server sent one (row count may have changed)
            if (payload.profile)               setProfile(payload.profile);

            // Signal that the AI has produced a result — unlocks the main preview area
            if (payload.preview !== undefined || payload.versions?.length) {
              setHasAIResult(true);
            }

            const latestVersion = payload.versions?.[payload.versions.length - 1];
            updateMessage(assistantId, {
              content: payload.explanation || "Done.",
              streaming: false,
              versionLabel: latestVersion?.label,
              actions: payload.actions,
            });
            setLoading(false);
            streamingId.current = null;

          } else if (payload.type === "error") {
            updateMessage(assistantId, { content: `⚠ ${payload.message}`, streaming: false });
            setLoading(false);
            streamingId.current = null;
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") {
        updateMessage(assistantId, { content: "Stopped.", streaming: false });
      } else {
        updateMessage(assistantId, {
          content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
          streaming: false,
        });
      }
      setLoading(false);
      streamingId.current = null;
    }
  };

  const handleAutoClean = async () => {
    if (isLoading || !datasetName) return;
    setLoading(true);
    addMessage({ id: crypto.randomUUID(), role: "user", content: "Auto-clean the dataset", timestamp: Date.now() });
    try {
      const res = await autoClean();
      if (res.preview)  setPreviewData(res.preview);
      if (res.versions) setVersions(res.versions);
      const ops = res.operations.map((o: any) => o.description).join("\n");
      addMessage({ id: crypto.randomUUID(), role: "assistant", content: ops || "Dataset is already clean!", timestamp: Date.now() });
    } catch (err: unknown) {
      addMessage({ id: crypto.randomUUID(), role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`, timestamp: Date.now() });
    } finally {
      setLoading(false);
    }
  };

  const hasMultipleDatasets = loadedDatasets.length > 1;

  return (
    <>
      {/* Header */}
      <div className="px-3 py-2 border-b shrink-0 flex items-center justify-between" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <div className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-faint)" }}>Chat</div>
        {datasetName && (
          <button onClick={handleAutoClean} disabled={isLoading}
            className="text-[9px] px-2 py-0.5 rounded-lg disabled:opacity-50 transition flex items-center gap-1 font-medium"
            style={{ background: "var(--accent-subtle)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
            <Sparkles className="w-2.5 h-2.5" />Auto Clean
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ background: "var(--bg)" }}>
        {messages.length === 0 && (
          <div className="text-center text-xs mt-8 px-4 leading-relaxed animate-fade-up" style={{ color: "var(--text-faint)" }}>
            <MessageSquare className="mx-auto mb-2 w-5 h-5" strokeWidth={1.5} style={{ color: "var(--text-ghost)" }} />
            Talk to your data.
            <br />
            <span style={{ color: "var(--text-faint)" }}>
              Try: "clean duplicates", "join users and orders on id", or "show quality score"
            </span>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user" ? "rounded-xl rounded-br-sm font-medium" : "rounded-xl rounded-bl-sm"
                }`}
                style={msg.role === "user"
                  ? { background: "var(--accent-muted)", border: "1px solid var(--accent-border)", color: "var(--text-primary)" }
                  : { background: "var(--bg-sunken)", border: "1px solid var(--border)", color: "var(--text-secondary)" }
                }
              >
                {msg.content}
                {msg.streaming && (
                  <span className="inline-block w-[2px] h-[12px] bg-pureql-accent ml-0.5 align-middle animate-pulse" />
                )}
              </div>
            </div>
            {msg.versionLabel && (
              <div className="flex justify-center mt-1">
                <span className="text-[8px] px-2 py-0.5 rounded-full flex items-center gap-1 font-medium" style={{ color: "var(--accent)", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
                  <Check className="w-2.5 h-2.5" />{msg.versionLabel}
                </span>
              </div>
            )}
          </div>
        ))}

        <div ref={endRef} />
      </div>

      {/* Dataset Picker Dropdown */}
      {hasMultipleDatasets && showDatasetPicker && (
        <div className="mx-2 mb-1 rounded-xl overflow-hidden border" style={{ background: "white", borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" }}>
          <div className="px-2 py-1.5 border-b" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <span className="text-[9px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-faint)" }}>Select datasets for this prompt</span>
          </div>
          <div className="p-1.5 space-y-0.5 max-h-40 overflow-y-auto">
            {loadedDatasets.map((ds) => {
              const isSelected = selectedDatasets.includes(ds.name);
              return (
                <button
                  key={ds.name}
                  onClick={() => toggleSelectedDataset(ds.name)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition ${
                    isSelected
                      ? "bg-pureql-accent-dim border border-pureql-accent/30"
                      : "hover:bg-pureql-panel border border-transparent"
                  }`}
                >
                  <div className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 transition ${
                    isSelected ? "border-transparent" : "border-zinc-300"
                  }`}>
                    {isSelected && <Check className="w-2 h-2 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{ds.name}</div>
                    <div className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                      {ds.rowCount.toLocaleString()} rows · {ds.colCount} cols
                    </div>
                  </div>
                  {ds.isActive && (
                    <span className="text-[8px] px-1 py-0.5 bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/20 shrink-0">
                      active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected dataset chips */}
      {selectedDatasets.length > 0 && (
        <div className="px-2 pb-1 flex flex-wrap gap-1">
          {selectedDatasets.map((name) => (
            <span key={name}
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full
                         bg-sky-500/15 border border-sky-500/25 text-sky-400">
              <Layers className="w-2.5 h-2.5" />
              <span className="max-w-[80px] truncate">{name}</span>
              <button
                onClick={() => toggleSelectedDataset(name)}
                className="hover:text-sky-200 transition"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-2 border-t shrink-0" style={{ borderColor: "var(--border)", background: "white" }}>
        <div className="flex gap-1.5">
          {/* Dataset selector toggle (only when multiple datasets loaded) */}
          {hasMultipleDatasets && (
            <button
              onClick={() => setShowDatasetPicker((v) => !v)}
              title="Select datasets for this prompt"
              className="px-2 py-2 rounded-md border text-xs transition flex items-center gap-1 shrink-0"
              style={
                showDatasetPicker || selectedDatasets.length > 0
                  ? { background: "var(--accent-subtle)", borderColor: "var(--accent-border)", color: "var(--accent)" }
                  : { background: "transparent", borderColor: "var(--border)", color: "var(--text-faint)" }
              }
            >
              <Layers className="w-3 h-3" />
              {selectedDatasets.length > 0 && (
                <span className="text-[9px] font-bold">{selectedDatasets.length}</span>
              )}
              {showDatasetPicker ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronUp className="w-2.5 h-2.5" />}
            </button>
          )}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={
              selectedDatasets.length > 1
                ? `Ask about ${selectedDatasets.length} datasets…`
                : datasetName
                ? "Ask anything..."
                : "Load a dataset first..."
            }
            disabled={isLoading && !streamingId.current}
            className="flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none disabled:opacity-50 input-base"
          />
          {isLoading ? (
            <button onClick={handleStop}
              className="px-3 py-2 rounded-xl transition flex items-center justify-center"
              style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", color: "var(--danger)" }}>
              <Square className="w-3 h-3 fill-current" />
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()}
              className="px-3 py-2 rounded-xl disabled:opacity-30 transition-all duration-150 flex items-center justify-center"
              style={{ background: "var(--gradient-accent)", boxShadow: "var(--accent-glow-sm)", color: "white" }}>
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}