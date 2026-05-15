'use client';

/** /manny — Manny chat-only popup page.
 *
 *  This route is the chat surface loaded into the popup window
 *  (Firefox/Safari) or in-page iframe modal (Chrome) opened by the
 *  global `FloatingChat` launcher. LayoutShell suppresses the sidebar /
 *  top bar / launcher on this path so the popup window is a clean
 *  full-bleed chat experience.
 *
 *  Reuses the same /api/chat backend as the /chat page — same SSE event
 *  vocabulary, same tool-use loop, same v0.5.3 suggested_followups chips.
 *  Differs from /chat by being chrome-less and persona-switcher-equipped
 *  (since there's no global PersonaSwitch in the popup shell).
 */
import { useEffect, useRef, useState } from 'react';
import { Bot, Send, RotateCcw, Sparkles } from 'lucide-react';
import { chatStream } from '@/lib/api-client';
import { MarkdownView } from '@/components/MarkdownView';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

const MFG_BRAND_GRADIENT = 'bg-gradient-to-br from-accent-700 via-accent-600 to-accent-400';

const PERSONA_LABEL: Record<Persona, string> = {
  buyer: '구매', engineer: 'R&D', quality: '품질', scm: 'SCM', plant: '생산',
};

const PERSONA_TONE: Record<Persona, string> = {
  buyer:    'border-blue-500/50    bg-blue-500/15    text-blue-200',
  engineer: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  quality:  'border-amber-500/50   bg-amber-500/15   text-amber-200',
  scm:      'border-rose-500/50    bg-rose-500/15    text-rose-200',
  plant:    'border-violet-500/50  bg-violet-500/15  text-violet-200',
};

const SAMPLE_QUERIES_BY_PERSONA: Record<Persona, string[]> = {
  buyer: [
    '안녕 Manny! 1차 협력사 중 OTD 95% 이상 + 단가 인하 가능 후보',
    'AMZN-CMP-IC-00001 EOL 대체품 + 단가 비교',
    '리드타임 8주 이하 + MOQ 1k 이하 협력사 추천',
    'AEC-Q100 인증 + 동등 패키지 Tier-1 후보 5개',
    '이번 분기 단가 인하 협상 우선순위 부품 10개',
  ],
  engineer: [
    '안녕 Manny! AutoCockpit C7용 8" QHD 디스플레이 후보 5개',
    'AMZN-CMP-IC-00001 부품의 AEC-Q100 인증 상태',
    'FC-BGA Gen5 솔더볼 균열 유사 사례 8D',
    '차량용 -40°C BGA 패키지 동등품 검색',
    'JEDEC JESD22 신뢰성 시험 기준 부품 매핑',
  ],
  quality: [
    '안녕 Manny! INC-2026-0412 인시던트 8D 리포트 자동 작성',
    'REACH-SVHC 위반 위험 부품 100개',
    '최근 30일 부적합 발생 Top 5 협력사',
    'IATF 16949 audit finding 미해결 항목',
    'RoHS 6대 물질 검출 부품 리스트',
  ],
  scm: [
    '안녕 Manny! IRA 2026 발효 시 MX→US lane 재라우팅 시뮬',
    'EU 수출 100t 강재의 CBAM 부담액 추정',
    'USMCA 75% 원산지 룰 충족 부품 비율',
    'FEoC 위험국 경유 lane 식별',
    '상하이 봉쇄 시나리오 대체 lane ETA 비교',
  ],
  plant: [
    '안녕 Manny! AMZN-PLANT-001 vibration 임계 초과 센서 + 정비 권고',
    '최근 7일 MTBF 하락 라인 식별',
    'OEE 75% 미만 라인의 root cause',
    'PdM 알람 발생 후 24h 내 정비된 비율',
    '온도 센서 이상치 패턴 분석',
  ],
};

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  toolLogs?: { tool: string; input: unknown }[];
};

export default function MannyPopupPage() {
  const { active, setActive } = useActivePersona();
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSessionId(`mfg_manny_${active}_${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`);
    setMessages([]);
    setFollowups([]);
  }, [active]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  function send(text: string) {
    const t = text.trim();
    if (!t || streaming) return;
    setMessages((m) => [...m, { role: 'user', text: t }, { role: 'assistant', text: '', toolLogs: [] }]);
    setInput('');
    setStreaming(true);
    setFollowups([]);

    let assistantText = '';
    const toolLogs: { tool: string; input: unknown }[] = [];

    cancelRef.current = chatStream(t, sessionId, active, (event) => {
      const ev = event as { type: string; [k: string]: unknown };
      if (ev.type === 'delta' || ev.type === 'token') {
        const chunk = String(ev.text ?? ev.content ?? '');
        assistantText += chunk;
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role !== 'assistant') return m;
          return [...m.slice(0, -1), { ...last, text: assistantText, toolLogs: [...toolLogs] }];
        });
      } else if (ev.type === 'tool_call') {
        const tool = String(ev.name ?? '');
        if (tool) {
          toolLogs.push({ tool, input: ev.args ?? {} });
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last?.role !== 'assistant') return m;
            return [...m.slice(0, -1), { ...last, toolLogs: [...toolLogs] }];
          });
        }
      } else if (ev.type === 'suggested_followups') {
        const items = Array.isArray(ev.items) ? (ev.items as unknown[]).map(String) : [];
        setFollowups(items.slice(0, 3));
      } else if (ev.type === 'stop' || ev.type === 'done') {
        setStreaming(false);
      }
    });
  }

  function reset() {
    cancelRef.current?.();
    setMessages([]);
    setFollowups([]);
    setSessionId(`mfg_manny_${active}_${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`);
  }

  const personas: Persona[] = ['buyer', 'engineer', 'quality', 'scm', 'plant'];

  return (
    <div className="h-screen w-screen flex flex-col bg-ink-950">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-accent-500/30 bg-gradient-to-r from-accent-700/15 via-accent-600/5 to-transparent shrink-0">
        <div className={`w-9 h-9 rounded-full ${MFG_BRAND_GRADIENT} flex items-center justify-center shadow-md shrink-0`}>
          <Bot className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-ink-50">
            Manny <span className="text-[10px] font-mono text-accent-300 ml-1">MFG AI</span>
          </div>
          <div className="text-[10px] text-ink-400">
            {PERSONA_LABEL[active]} 톤 · 5 도구 · Sonnet 4.6
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={reset}
            className="text-[10px] text-ink-400 hover:text-ink-200 flex items-center gap-1 px-2 py-1 rounded hover:bg-ink-800"
            title="새 세션"
          >
            <RotateCcw className="w-3 h-3" /> 새로
          </button>
        )}
      </header>

      {/* Persona switcher — popup has no global PersonaSwitch, so wire it here. */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-ink-800 bg-ink-900/60 shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-ink-500 mr-1">부서</span>
        {personas.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setActive(p)}
            className={[
              'text-[10px] font-mono px-2 py-1 rounded border transition',
              active === p
                ? PERSONA_TONE[p]
                : 'border-ink-700 bg-ink-800 text-ink-400 hover:border-ink-600 hover:text-ink-200',
            ].join(' ')}
          >
            {PERSONA_LABEL[p]}
          </button>
        ))}
      </div>

      {/* Message scroll */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <>
            <div className="p-4 rounded-lg bg-gradient-to-r from-accent-700/20 to-accent-500/10 border border-accent-500/30 mb-3">
              <div className="text-base font-semibold text-accent-200 mb-1">
                안녕하세요, Manny예요 🔩
              </div>
              <div className="text-xs text-ink-300 leading-relaxed">
                22 클래스 제조 온톨로지 (BOM · 협력사 · 인증 · 8D · ESG) 위에서
                자연어로 물어보세요. 부서 페르소나 시점으로 분석해 드립니다.
                상단 부서 칩으로 어조와 KPI를 바꿀 수 있습니다.
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent-300 font-semibold mb-1.5">
              <Sparkles className="w-3 h-3" /> Manny가 추천하는 질문
            </div>
            <div className="flex flex-col gap-1.5">
              {(SAMPLE_QUERIES_BY_PERSONA[active] ?? []).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  disabled={streaming}
                  className="text-left text-xs px-3 py-2 rounded-md border border-ink-700 bg-ink-800 text-ink-200 hover:border-accent-500/60 hover:text-accent-200 hover:bg-accent-700/10 transition disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={[
              'p-3 rounded-md text-sm leading-relaxed',
              m.role === 'user'
                ? 'bg-accent-700/15 border border-accent-500/30 text-ink-100'
                : 'bg-ink-800 border border-ink-700 text-ink-200',
            ].join(' ')}
          >
            {m.role === 'user' ? (
              <span className="whitespace-pre-wrap">{m.text}</span>
            ) : (
              <MarkdownView text={m.text || (streaming ? '…' : '')} />
            )}
            {m.toolLogs && m.toolLogs.length > 0 && (
              <div className="mt-2 pt-2 border-t border-ink-700/40 text-[10px] text-ink-500 font-mono">
                tool: {m.toolLogs.map((t) => t.tool).join(' · ')}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Followup chips */}
      {followups.length > 0 && !streaming && (
        <div className="px-4 pt-2 pb-1 border-t border-accent-500/10 bg-ink-950 shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-accent-300/70 font-semibold mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Manny 추천 후속 질문
          </div>
          <div className="flex flex-wrap gap-1.5">
            {followups.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className="text-left text-xs px-3 py-1.5 rounded-full border border-accent-500/40 bg-accent-700/15 text-accent-200 hover:bg-accent-700/30 hover:text-ink-50 transition"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex gap-2 px-4 py-3 border-t border-accent-500/20 bg-ink-950 shrink-0"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
          placeholder="Manny에게 자연어로 질문하세요"
          className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500 disabled:opacity-50"
          autoFocus
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          className={`px-4 py-2 rounded-md ${MFG_BRAND_GRADIENT} hover:opacity-90 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 shadow-md`}
        >
          <Send className="w-3.5 h-3.5" />
          {streaming ? '…' : '전송'}
        </button>
      </form>
    </div>
  );
}
