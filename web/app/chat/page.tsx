"use client";
import { useState, useRef } from "react";
import { Send, Bot, User } from "lucide-react";
import { chatStream } from "@/lib/api-client";
import { useActivePersona } from "@/lib/persona-context";
import type { Persona } from "@/lib/types";

interface Message { role: "user" | "assistant"; text: string; }
interface ToolEvent { type: string; tool?: string; content?: string; }

type Sample = { label: string; persona: Persona };

const CHAT_SAMPLES: Sample[] = [
  { label: "AMZN-CMP-IC-00001 부품의 AEC-Q100 인증 상태 알려줘", persona: "engineer" },
  { label: "1차 협력사 중 OTD 95% 이상 + 단가 인하 가능 후보",   persona: "buyer" },
  { label: "INC-2026-0412 인시던트 8D 리포트 자동 작성",          persona: "quality" },
  { label: "IRA 2026 발효 시 MX→US lane 재라우팅 시뮬",            persona: "scm" },
  { label: "AMZN-PLANT-001 vibration 임계 초과 센서 + 정비 권고",  persona: "plant" },
  { label: "FC-BGA Gen5 솔더볼 균열 유사 사례 8D",                 persona: "quality" },
  { label: "AutoCockpit C7용 8\" QHD 디스플레이 후보 5개",          persona: "engineer" },
  { label: "EU 수출 100t 강재의 CBAM 부담액 추정",                 persona: "scm" },
  { label: "AMZN-CMP-IC-00001 EOL 대체품 + 단가 비교",              persona: "buyer" },
  { label: "REACH-SVHC 위반 위험 부품 100개",                      persona: "quality" },
];

const PERSONA_TONE: Record<Persona, string> = {
  buyer:    "border-blue-500/40    bg-blue-500/10    text-blue-200",
  engineer: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  quality:  "border-amber-500/40   bg-amber-500/10   text-amber-200",
  scm:      "border-rose-500/40    bg-rose-500/10    text-rose-200",
  plant:    "border-violet-500/40  bg-violet-500/10  text-violet-200",
};

const PERSONA_LABEL: Record<Persona, string> = {
  buyer:    "Buyer 구매",
  engineer: "Engineer R&D",
  quality:  "Quality 품질",
  scm:      "SCM 공급망",
  plant:    "Plant 생산",
};

export default function ChatPage() {
  const { active, setActive } = useActivePersona();
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolLog, setToolLog] = useState<ToolEvent[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const sessionId = useRef(`mfg-${active}-${Date.now()}`);
  const cancelRef = useRef<(() => void) | null>(null);

  function send(msg?: string) {
    const text = (msg ?? input).trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setStreaming(true);
    setToolLog([]);
    let buffer = "";

    cancelRef.current = chatStream(
      text,
      sessionId.current,
      active,
      (ev) => {
        if (ev.type === "token") {
          buffer += String(ev.content ?? "");
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return [...prev.slice(0, -1), { role: "assistant", text: buffer }];
            }
            return [...prev, { role: "assistant", text: buffer }];
          });
        } else if (ev.type === "tool_call" || ev.type === "tool_result" || ev.type === "guardrail") {
          setToolLog((prev) => [...prev, ev as ToolEvent]);
        } else if (ev.type === "done") {
          setStreaming(false);
          buffer = "";
        }
      }
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">시나리오 B · 대화형 에이전트</div>
        <span className="ml-3 text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-mono">WOW</span>
        <div className="ml-auto text-xs text-ink-500">페르소나: <span className="text-ink-200 font-medium">{active}</span></div>
      </header>

      <div className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-2 gap-6 h-[calc(100vh-56px)]">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold text-ink-50 mb-1">대화형 에이전트</h1>
          <p className="text-xs text-ink-400 mb-3">Bedrock Converse + AgentCore Memory + Guardrails + 4 도구</p>

          {messages.length === 0 && (
            <div className="mb-5">
              <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
                추천 질문 — 클릭하면 바로 전송됩니다
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CHAT_SAMPLES.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={streaming}
                    onClick={() => { setActive(p.persona); send(p.label); }}
                    className="group flex items-start gap-2 text-left px-3 py-2.5 rounded-lg border border-ink-700 bg-ink-900 hover:border-accent-500/60 hover:bg-ink-800 transition disabled:opacity-50"
                  >
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${PERSONA_TONE[p.persona]}`}>
                      {PERSONA_LABEL[p.persona]}
                    </span>
                    <span className="text-sm text-ink-200 leading-relaxed group-hover:text-accent-200">
                      {p.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-3 border border-ink-700 rounded-lg p-4 bg-ink-900 min-h-[300px]">
            {messages.length === 0 && (
              <div className="flex items-center gap-3 text-ink-500 text-sm italic">
                <Bot className="w-5 h-5 shrink-0" />
                <span>안녕하세요! MFG 온톨로지 AI 어시스턴트입니다. 부품·공급망·품질·ESG에 대해 질문하세요.</span>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-accent-500/20 border border-accent-500/40 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-3.5 h-3.5 text-accent-300" />
                  </div>
                )}
                <span className={[
                  "inline-block px-3 py-2 rounded-lg text-sm max-w-[80%] whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-accent-600 text-ink-50"
                    : "bg-ink-800 border border-ink-700 text-ink-200",
                ].join(" ")}>
                  {m.text}
                </span>
                {m.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-ink-700 flex items-center justify-center shrink-0 mt-1">
                    <User className="w-3.5 h-3.5 text-ink-300" />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-3">
            <input
              className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500"
              placeholder={`${active} 페르소나로 질문하기...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            />
            <button
              onClick={() => send()}
              disabled={streaming}
              className="bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 px-4 py-2 rounded-md transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          <h2 className="text-lg font-semibold text-ink-100 mb-2">도구 호출 / 가드레일 로그</h2>
          <p className="text-xs text-ink-400 mb-3">★ Memory 재활성화 + Guardrail 발동 이벤트가 실시간 표시됩니다</p>
          <div className="flex-1 border border-ink-700 rounded-lg p-4 bg-ink-950 text-green-400 text-xs font-mono overflow-y-auto min-h-[400px]">
            {toolLog.length === 0 && (
              <span className="text-ink-600 italic">도구 호출 이벤트 대기 중...</span>
            )}
            {toolLog.map((ev, i) => (
              <div key={i} className={[
                "mb-1.5 leading-relaxed",
                ev.type === "guardrail" ? "text-orange-300" : "text-green-400",
              ].join(" ")}>
                <span className="text-ink-500">[{ev.type}]</span>{" "}
                {ev.tool && <span className="text-accent-300">{ev.tool}</span>}{" "}
                {ev.content ? `→ ${String(ev.content).slice(0, 120)}` : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
