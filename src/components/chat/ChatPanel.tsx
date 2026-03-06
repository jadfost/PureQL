import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../../stores/appStore";

export function ChatPanel() {
  const [input, setInput] = useState("");
  const { messages, addMessage, selectedModel } = useAppStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: input.trim(),
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    setInput("");

    // TODO: Send to Python core via Tauri IPC
    // For now, add a placeholder response
    setTimeout(() => {
      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Processing your request... (AI engine not yet connected)",
        timestamp: Date.now(),
      });
    }, 500);
  };

  return (
    <>
      {/* Header */}
      <div className="px-3 py-2 border-b border-pureql-border shrink-0">
        <div className="text-[10px] font-semibold text-zinc-500 tracking-wide">
          CHAT
        </div>
        {selectedModel && (
          <div className="text-[9px] text-zinc-600 mt-0.5">
            {selectedModel}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-zinc-600 text-xs mt-8 px-4 leading-relaxed">
            <div className="text-lg mb-2">💬</div>
            Talk to your data in natural language.
            <br />
            <span className="text-zinc-500">
              Try: "clean duplicates" or "show me the quality score"
            </span>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            <div
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-3 py-2 text-[11px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-purple-500/20 border border-purple-500/30 rounded-xl rounded-br-sm text-zinc-200"
                    : "bg-pureql-card border border-pureql-border rounded-xl rounded-bl-sm text-zinc-400"
                }`}
              >
                {msg.content}
              </div>
            </div>
            {msg.version && (
              <div className="flex justify-center mt-1">
                <span className="text-[8px] text-pureql-accent bg-pureql-accent-dim px-2 py-0.5 rounded">
                  ✓ {msg.version}
                </span>
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-pureql-border shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask anything..."
            className="flex-1 bg-pureql-card border border-pureql-border rounded-md px-3 py-2 
                       text-xs text-zinc-300 placeholder:text-zinc-600 
                       focus:outline-none focus:border-pureql-accent/40"
          />
          <button
            onClick={handleSend}
            className="px-3 py-2 bg-pureql-accent-dim border border-pureql-accent/30 
                       rounded-md text-pureql-accent text-xs hover:bg-pureql-accent/20 transition"
          >
            ↑
          </button>
        </div>
      </div>
    </>
  );
}
