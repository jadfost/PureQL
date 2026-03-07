import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../../stores/appStore";
import { sendChat, autoClean } from "../../lib/api";
import { MessageSquare, ArrowUp, Check, Sparkles } from "lucide-react";

export function ChatPanel() {
  const [input, setInput] = useState("");
  const {
    messages, addMessage, setPreviewData, setVersions,
    setProfile, isLoading, setLoading, setCurrentSQL,
    datasetName,
  } = useAppStore();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");

    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    });

    setLoading(true);

    try {
      const res = await sendChat(text);

      if (res.preview) setPreviewData(res.preview);
      if (res.versions) setVersions(res.versions);

      for (const r of res.results) {
        if (r.sql) setCurrentSQL(r.sql);
      }

      const latestVersion = res.versions?.[res.versions.length - 1];

      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.explanation || "Done.",
        timestamp: Date.now(),
        versionLabel: latestVersion?.label,
      });
    } catch (err: unknown) {
      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAutoClean = async () => {
    if (isLoading || !datasetName) return;
    setLoading(true);

    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: "Auto-clean the dataset",
      timestamp: Date.now(),
    });

    try {
      const res = await autoClean();
      if (res.preview) setPreviewData(res.preview);
      if (res.versions) setVersions(res.versions);

      const ops = res.operations.map((o) => o.description).join("\n");
      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: ops || "Dataset is already clean!",
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: Date.now(),
      });
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
          <button
            onClick={handleAutoClean}
            disabled={isLoading}
            className="text-[9px] px-2 py-0.5 rounded bg-pureql-accent-dim text-pureql-accent 
                       border border-pureql-accent/30 hover:bg-pureql-accent/20 
                       disabled:opacity-50 transition flex items-center gap-1"
          >
            <Sparkles className="w-2.5 h-2.5" />
            Auto Clean
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
              <div
                className={`max-w-[85%] px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-purple-500/20 border border-purple-500/30 rounded-xl rounded-br-sm text-zinc-200"
                    : "bg-pureql-card border border-pureql-border rounded-xl rounded-bl-sm text-zinc-400"
                }`}
              >
                {msg.content}
              </div>
            </div>
            {msg.versionLabel && (
              <div className="flex justify-center mt-1">
                <span className="text-[8px] text-pureql-accent bg-pureql-accent-dim px-2 py-0.5 rounded flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" />
                  {msg.versionLabel}
                </span>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-pureql-card border border-pureql-border rounded-xl rounded-bl-sm px-3 py-2 text-[11px] text-zinc-500">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}

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
            disabled={isLoading}
            className="flex-1 bg-pureql-card border border-pureql-border rounded-md px-3 py-2 
                       text-xs text-zinc-300 placeholder:text-zinc-600 
                       focus:outline-none focus:border-pureql-accent/40
                       disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-3 py-2 bg-pureql-accent-dim border border-pureql-accent/30 
                       rounded-md text-pureql-accent hover:bg-pureql-accent/20 
                       disabled:opacity-30 transition flex items-center justify-center"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}