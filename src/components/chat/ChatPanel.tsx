import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../../stores/appStore";
import { autoClean } from "../../lib/api";
import { MessageSquare, ArrowUp, Check, Sparkles, Square } from "lucide-react";

const BRIDGE = "http://127.0.0.1:9741";

export function ChatPanel() {
  const [input, setInput] = useState("");
  const {
    messages, addMessage, updateMessage,
    setPreviewData, setVersions,
    setProfile, isLoading, setLoading, setCurrentSQL,
    datasetName,
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

    // Placeholder assistant message for streaming
    const assistantId = crypto.randomUUID();
    streamingId.current = assistantId;
    addMessage({ id: assistantId, role: "assistant", content: "", timestamp: Date.now(), streaming: true });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`${BRIDGE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";
      let displayed = ""; // accumulated visible text so far

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
            // Show raw tokens during generation — trim leading { later
            const visible = displayed.startsWith("{") ? "Thinking…" : displayed;
            updateMessage(assistantId, { content: visible, streaming: true });

          } else if (payload.type === "done") {
            for (const r of (payload.results ?? [])) {
              if (r.sql) setCurrentSQL(r.sql);
            }
            if (payload.preview?.length)  setPreviewData(payload.preview);
            if (payload.versions?.length) setVersions(payload.versions);

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

  return (
    <>
      {/* Header */}
      <div className="px-3 py-2 border-b border-pureql-border shrink-0 flex items-center justify-between">
        <div className="text-[10px] font-semibold text-zinc-500 tracking-wide">CHAT</div>
        {datasetName && (
          <button onClick={handleAutoClean} disabled={isLoading}
            className="text-[9px] px-2 py-0.5 rounded bg-pureql-accent-dim text-pureql-accent
                       border border-pureql-accent/30 hover:bg-pureql-accent/20
                       disabled:opacity-50 transition flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" />Auto Clean
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-zinc-600 text-xs mt-8 px-4 leading-relaxed">
            <MessageSquare className="mx-auto mb-2 w-5 h-5 text-zinc-400" strokeWidth={1.5} />
            Talk to your data.
            <br />
            <span className="text-zinc-500">
              Try: "clean duplicates", "normalize the city column", or "show quality score"
            </span>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-purple-500/20 border border-purple-500/30 rounded-xl rounded-br-sm text-zinc-200"
                  : "bg-pureql-card border border-pureql-border rounded-xl rounded-bl-sm text-zinc-400"
              }`}>
                {msg.content}
                {/* Blinking cursor while streaming */}
                {msg.streaming && (
                  <span className="inline-block w-[2px] h-[12px] bg-pureql-accent ml-0.5 align-middle animate-pulse" />
                )}
              </div>
            </div>
            {msg.versionLabel && (
              <div className="flex justify-center mt-1">
                <span className="text-[8px] text-pureql-accent bg-pureql-accent-dim px-2 py-0.5 rounded flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" />{msg.versionLabel}
                </span>
              </div>
            )}
          </div>
        ))}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-pureql-border shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={datasetName ? "Ask anything..." : "Load a dataset first..."}
            disabled={isLoading && !streamingId.current}
            className="flex-1 bg-pureql-card border border-pureql-border rounded-md px-3 py-2
                       text-xs text-zinc-300 placeholder:text-zinc-600
                       focus:outline-none focus:border-pureql-accent/40
                       disabled:opacity-50"
          />
          {isLoading ? (
            <button onClick={handleStop}
              className="px-3 py-2 bg-red-500/10 border border-red-500/30
                         rounded-md text-red-400 hover:bg-red-500/20 transition flex items-center justify-center">
              <Square className="w-3 h-3 fill-current" />
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()}
              className="px-3 py-2 bg-pureql-accent-dim border border-pureql-accent/30
                         rounded-md text-pureql-accent hover:bg-pureql-accent/20
                         disabled:opacity-30 transition flex items-center justify-center">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}