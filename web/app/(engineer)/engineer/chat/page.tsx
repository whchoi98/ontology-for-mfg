"use client";
import { useState, useRef } from "react";
import { chatStream } from "@/lib/api-client";

interface Message {
  role: "user" | "assistant";
  text: string;
}

interface ToolEvent {
  type: string;
  tool?: string;
  content?: string;
}

export default function EngineerChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolLog, setToolLog] = useState<ToolEvent[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const sessionId = useRef(`engineer-${Date.now()}`);

  function send() {
    if (!input.trim() || streaming) return;
    const msg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setStreaming(true);
    setToolLog([]);

    let buffer = "";
    chatStream(msg, sessionId.current, "engineer", (ev) => {
      if (ev.type === "token") {
        buffer += String(ev.content ?? "");
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return [...prev.slice(0, -1), { role: "assistant", text: buffer }];
          }
          return [...prev, { role: "assistant", text: buffer }];
        });
      } else if (ev.type === "tool_call" || ev.type === "tool_result") {
        setToolLog((prev) => [...prev, ev as ToolEvent]);
      } else if (ev.type === "done") {
        setStreaming(false);
        buffer = "";
      }
    });
  }

  return (
    <div className="grid grid-cols-2 gap-4 h-[calc(100vh-120px)]">
      <div className="flex flex-col">
        <h1 className="font-bold text-xl mb-3">AI 대화 (Engineer)</h1>
        <div className="flex-1 overflow-y-auto space-y-2 border rounded p-3 bg-white">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block px-3 py-1.5 rounded-lg text-sm ${
                  m.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-100 text-neutral-900"
                }`}
              >
                {m.text}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input
            className="flex-1 border rounded px-3 py-2 text-sm"
            placeholder="기술 문의 입력..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button
            onClick={send}
            disabled={streaming}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {streaming ? "..." : "전송"}
          </button>
        </div>
      </div>
      <div>
        <h2 className="font-bold text-lg mb-2">Tool 호출 로그</h2>
        <div className="border rounded p-3 bg-neutral-900 text-green-400 text-xs font-mono h-[400px] overflow-y-auto">
          {toolLog.map((ev, i) => (
            <div key={i} className="mb-1">
              [{ev.type}] {ev.tool ?? ""}{" "}
              {ev.content ? `→ ${String(ev.content).slice(0, 80)}` : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
