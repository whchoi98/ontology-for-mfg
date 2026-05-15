"use client";
import { useEffect, useRef, useState } from "react";
import { Download, FileText } from "lucide-react";
import { chatStream } from "@/lib/api-client";
import { exportToPdf } from "@/lib/pdf-export";
import { useActivePersona } from "@/lib/persona-context";
import type { Persona } from "@/lib/types";
import { MarkdownView } from "@/components/MarkdownView";
import { ScenarioHeader } from "@/components/ScenarioHeader";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  toolLogs?: { tool: string; input: unknown }[];
};
type Phase = { name: string; detail?: string };
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

// Phase chip palette — guardrail bookends + bedrock + per-tool stages.
// Unknown phases (e.g. dynamic tool names) fall through to slate.
const PHASE_META: Record<string, { label: string; tone: string }> = {
  "guardrail":     { label: "입력 가드레일",   tone: "border-rose-500/40   bg-rose-500/10   text-rose-200" },
  "guardrail-out": { label: "응답 가드레일",   tone: "border-rose-500/40   bg-rose-500/10   text-rose-200" },
  "bedrock":       { label: "Sonnet 4.6 추론", tone: "border-orange-500/40 bg-orange-500/10 text-orange-200" },
  "tool_use":      { label: "도구 사용",        tone: "border-cyan-500/40   bg-cyan-500/10   text-cyan-200" },
};

function phaseToneFor(name: string): { label: string; tone: string } {
  if (PHASE_META[name]) return PHASE_META[name];
  if (name.startsWith("tool:")) {
    return { label: name.replace("tool:", "🔧 "), tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" };
  }
  return { label: name, tone: "border-slate-500/40 bg-slate-500/10 text-slate-200" };
}

export default function ChatPage() {
  const { active, setActive } = useActivePersona();
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [toolLog, setToolLog] = useState<{ tool: string; input: unknown }[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [followups, setFollowups] = useState<string[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persona change → new session + clean slate so the user sees an honest
  // restart (sample prompts re-appear, no stale followups carrying over).
  useEffect(() => {
    setSessionId(`mfg_${active}_${(globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36))}`);
    setMessages([]);
    setToolLog([]);
    setPhases([]);
    setFollowups([]);
  }, [active]);

  // Auto-scroll to bottom as new tokens arrive
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    const userMsg: ChatMessage = { role: "user", text: trimmed };
    setMessages((m) => [...m, userMsg, { role: "assistant", text: "", toolLogs: [] }]);
    setInput("");
    setStreaming(true);
    setToolLog([]);
    setPhases([]);
    setFollowups([]);

    let assistantText = "";
    const sessionToolLogs: { tool: string; input: unknown }[] = [];

    cancelRef.current = chatStream(trimmed, sessionId, active, (event) => {
      const ev = event as { type: string; [k: string]: unknown };

      // Map MFG event vocabulary → retail-style phase chips + tool log
      if (ev.type === "guardrail") {
        const name = String(ev.name ?? "");
        const phaseName = name === "output_check" ? "guardrail-out" : "guardrail";
        const detail = String(ev.result ?? ev.content ?? "");
        setPhases((p) => [...p, { name: phaseName, detail: detail.slice(0, 60) }]);
      } else if (ev.type === "phase") {
        const phaseName = String(ev.phase ?? "");
        if (phaseName === "thinking") setPhases((p) => [...p, { name: "bedrock" }]);
        else if (phaseName === "tool_use") setPhases((p) => [...p, { name: "tool_use" }]);
        else setPhases((p) => [...p, { name: phaseName }]);
      } else if (ev.type === "tool_call") {
        const tool = String(ev.name ?? "");
        const input = ev.args ?? {};
        setPhases((p) => [...p, { name: `tool:${tool}` }]);
        sessionToolLogs.push({ tool, input });
        setToolLog((logs) => [...logs, { tool, input }]);
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role !== "assistant") return m;
          return [...m.slice(0, -1), { ...last, toolLogs: [...sessionToolLogs] }];
        });
      } else if (ev.type === "tool_result") {
        // Update last phase chip's detail with concise result hint
        const result = ev.result;
        const hint = typeof result === "object" && result !== null
          ? `${Object.keys(result).slice(0, 3).join(",")} ✓`
          : "✓";
        setPhases((p) => {
          if (p.length === 0) return p;
          const last = p[p.length - 1];
          return [...p.slice(0, -1), { ...last, detail: hint }];
        });
      } else if (ev.type === "delta" || ev.type === "token") {
        const chunk = String(ev.text ?? ev.content ?? "");
        assistantText += chunk;
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role !== "assistant") return m;
          return [...m.slice(0, -1), { ...last, text: assistantText, toolLogs: [...sessionToolLogs] }];
        });
      } else if (ev.type === "suggested_followups") {
        const items = Array.isArray(ev.items) ? (ev.items as unknown[]).map(String) : [];
        setFollowups(items.slice(0, 3));
      } else if (ev.type === "stop" || ev.type === "done") {
        setStreaming(false);
      }
    });
  }

  // ─── Export helpers ────────────────────────────────────────────────────

  function buildMarkdown(): string {
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    const lines: string[] = [
      `# 대화형 에이전트 대화 기록 (MFG)`,
      ``,
      `- 세션: \`${sessionId}\``,
      `- 페르소나: ${PERSONA_LABEL[active]}`,
      `- 추출: ${stamp}`,
      `- 메시지 수: ${messages.length}`,
      ``,
      `---`,
      ``,
    ];
    messages.forEach((m, i) => {
      lines.push(`## ${i + 1}. ${m.role === "user" ? "사용자" : "에이전트"}`);
      lines.push("");
      lines.push(m.text || "_(빈 메시지)_");
      lines.push("");
      if (m.role === "assistant" && m.toolLogs && m.toolLogs.length > 0) {
        lines.push(`<details><summary>도구 호출 ${m.toolLogs.length}건</summary>`);
        lines.push("");
        m.toolLogs.forEach((t) => {
          lines.push(`- **${t.tool}** \`${JSON.stringify(t.input)}\``);
        });
        lines.push("");
        lines.push(`</details>`);
        lines.push("");
      }
    });
    return lines.join("\n");
  }

  function downloadMarkdown() {
    if (messages.length === 0) return;
    const md = buildMarkdown();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mfg-chat-${sessionId.replace(/^mfg_/, "")}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadPdf() {
    if (messages.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const sections = messages.map((m, i) => {
      const isUser = m.role === "user";
      const toolFooter =
        !isUser && m.toolLogs && m.toolLogs.length > 0
          ? `도구 호출 ${m.toolLogs.length}건: ` +
            m.toolLogs.map((t) => `${t.tool}(${JSON.stringify(t.input)})`).join(" · ")
          : undefined;
      return {
        badge: `${i + 1}.`,
        title: isUser ? "사용자" : "에이전트",
        body: m.text || "(빈 메시지)",
        footer: toolFooter,
        accentColor: isUser ? "#3b82f6" : "#10b981",
      };
    });

    await exportToPdf({
      title: `MFG 대화 기록 — ${sessionId}`,
      meta: `${PERSONA_LABEL[active]} · 추출 ${stamp} · 메시지 ${messages.length}`,
      sections,
      footer: `Ontology MFG · 대화형 에이전트 로그 · 합성 데이터 · 생성: ${stamp}`,
      filename: `mfg-chat-${sessionId.replace(/^mfg_/, "")}-${Date.now()}`,
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader
        scenario="B"
        title="대화형 에이전트"
        tech="Bedrock Converse + AgentCore Memory 멀티턴 + Tool-use (search·neptune·kb·compliance·memory) + Guardrails 4토픽 → SSE"
      />

      <div className="flex-1 mx-auto max-w-7xl w-full px-6 py-6 grid lg:grid-cols-[1fr_360px] gap-6">
        {/* ═══ Left: chat column ═══ */}
        <section className="flex flex-col h-[calc(100vh-160px)]">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-ink-50">시나리오 B · 대화형 에이전트</h1>
              <p className="text-sm text-ink-400 mb-4">
                AgentCore Memory + Bedrock Converse tool-use. 우측 패널에 도구 호출이 실시간 표시됩니다.
              </p>
            </div>
            {messages.length > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={downloadMarkdown}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-300 hover:border-accent-500 hover:text-accent-300 transition"
                  title="대화 기록을 .md 파일로 다운로드"
                >
                  <FileText className="w-3.5 h-3.5" /> MD
                </button>
                <button
                  type="button"
                  onClick={downloadPdf}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-300 hover:border-accent-500 hover:text-accent-300 transition"
                  title="대화 기록을 .pdf 파일로 다운로드"
                >
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
              </div>
            )}
          </div>

          {/* Input form — pinned to top so layout matches search/insights pages */}
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
            className="flex gap-2 mb-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={streaming}
              placeholder={`${PERSONA_LABEL[active]} 페르소나로 질문하기...`}
              className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-4 py-2 text-sm text-ink-100 outline-none focus:ring-2 focus:ring-accent-500 placeholder:text-ink-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              className="px-5 py-2 rounded-lg bg-accent-500 text-ink-950 font-semibold disabled:bg-ink-700 disabled:text-ink-400 hover:bg-accent-400 transition"
            >
              {streaming ? "응답 중…" : "전송"}
            </button>
          </form>

          {/* Streaming phase strip */}
          {(streaming || phases.length > 0) && (
            <div className="mb-4 rounded-lg border border-ink-700 bg-ink-900 p-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2 flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse-soft" />
                에이전트 진행 중 — {phases.length}단계
              </div>
              <ol className="flex flex-wrap items-center gap-2">
                {phases.map((p, i) => {
                  const meta = phaseToneFor(p.name);
                  return (
                    <li
                      key={i}
                      className={`flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded border ${meta.tone}`}
                    >
                      <span className="text-[9px] opacity-60">{i + 1}.</span>
                      <span className="font-semibold">{meta.label}</span>
                      {p.detail && <span className="opacity-70">— {p.detail}</span>}
                    </li>
                  );
                })}
                {streaming && (
                  <li className="text-[11px] font-mono px-2 py-1 rounded border border-ink-700 bg-ink-800/50 text-ink-400 animate-pulse-soft">
                    다음 단계…
                  </li>
                )}
              </ol>
            </div>
          )}

          {/* Suggested prompts — visible only on empty state */}
          {messages.length === 0 && (
            <div className="mb-5">
              <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
                추천 질문 — 클릭하면 바로 전송됩니다
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {CHAT_SAMPLES.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={streaming}
                    onClick={() => { setActive(p.persona); sendMessage(p.label); }}
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

          {/* Chat history */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg ${
                  m.role === "user"
                    ? "bg-accent-500/10 border border-accent-500/30 ml-12"
                    : "bg-ink-800 border border-ink-700 mr-12"
                }`}
              >
                <div className="text-xs font-semibold mb-1 text-ink-400">
                  {m.role === "user" ? "사용자" : "에이전트"}
                </div>
                {m.role === "user"
                  ? <p className="text-sm whitespace-pre-wrap leading-relaxed text-ink-100">{m.text}</p>
                  : <MarkdownView text={m.text || (streaming ? "…" : "")} />}
              </div>
            ))}

            {/* Suggested follow-up chips — only after the stream completes and
                the model returned 1–3 items. Click sends as the next turn. */}
            {!streaming && followups.length > 0 && (
              <div className="mr-12 pl-1">
                <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">
                  이어서 물어볼 만한 질문
                </div>
                <div className="flex flex-wrap gap-2">
                  {followups.map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => sendMessage(q)}
                      className="text-left text-xs px-3 py-1.5 rounded-full border border-accent-500/40 bg-accent-500/10 text-accent-200 hover:border-accent-400 hover:bg-accent-500/20 transition"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ═══ Right: tool log ═══ */}
        <aside className="border-l border-ink-700 pl-4 lg:h-[calc(100vh-160px)] lg:overflow-y-auto">
          <h2 className="text-sm font-semibold mb-3 text-ink-100">도구 호출 로그 (Gateway)</h2>
          {toolLog.length === 0 && (
            <p className="text-xs text-ink-500 italic">아직 도구 호출이 없습니다.</p>
          )}
          <ul className="space-y-2">
            {toolLog.map((t, i) => (
              <li
                key={i}
                className="p-2 rounded border border-ink-700 bg-ink-900"
              >
                <div className="font-mono text-xs text-accent-300">{t.tool}</div>
                <pre className="text-xs text-ink-400 overflow-x-auto whitespace-pre-wrap break-all mt-1">
                  {JSON.stringify(t.input, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
