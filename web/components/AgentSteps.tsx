'use client';

// Live rendering of one /api/chat assistant turn (lib/agent-steps): progress
// notes and tool cards in stream order, then the answer as Markdown. Shared by
// /chat and the Manny popup so both show what the agent is doing between
// tool calls instead of a bare "…".

import { AlertTriangle, Check, Loader2, Wrench } from 'lucide-react';
import { type AgentStep, type ToolStep, answerStart } from '@/lib/agent-steps';
import { MarkdownView } from '@/components/MarkdownView';

function ToolCard({ step }: { step: ToolStep }) {
  const icon =
    step.status === 'running' ? <Loader2 className="w-3 h-3 animate-spin text-cyan-300" aria-hidden />
    : step.status === 'error' ? <AlertTriangle className="w-3 h-3 text-red-300" aria-hidden />
    : <Check className="w-3 h-3 text-emerald-300" aria-hidden />;
  const tone =
    step.status === 'error' ? 'border-red-500/30 bg-red-500/5'
    : step.status === 'running' ? 'border-cyan-500/40 bg-cyan-500/5'
    : 'border-ink-700 bg-ink-900/60';
  return (
    <details className={`group rounded-sm border ${tone} text-[11px] font-mono`} data-testid="agent-tool-step">
      <summary className="flex items-center gap-1.5 px-2 py-1 cursor-pointer list-none text-ink-300">
        <Wrench className="w-3 h-3 text-ink-500" aria-hidden />
        <span className="text-accent-300">{step.name}</span>
        {icon}
        <span className="text-ink-500 truncate">
          {step.status === 'running' ? '실행 중…' : step.summary}
        </span>
      </summary>
      <pre className="px-2 pb-1.5 text-ink-400 whitespace-pre-wrap break-all">
        {JSON.stringify(step.args, null, 2)}
      </pre>
    </details>
  );
}

export function AgentSteps({ steps, streaming }: { steps: AgentStep[]; streaming: boolean }) {
  const start = answerStart(steps);
  const last = steps[steps.length - 1];
  // Between a tool result and the model's next text nothing streams — say so.
  const waiting = streaming && (!last || (last.kind === 'tool' && last.status !== 'running'));
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => {
        if (s.kind === 'tool') return <ToolCard key={i} step={s} />;
        if (i < start) {
          return (
            <div key={i} className="text-xs text-ink-400" data-testid="agent-note-step">
              <MarkdownView text={s.text} />
            </div>
          );
        }
        return <MarkdownView key={i} text={s.text} />;
      })}
      {waiting && (
        <div className="flex items-center gap-1.5 text-xs text-ink-500 animate-pulse-soft" data-testid="agent-waiting">
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
          {last ? '결과를 정리하고 있습니다…' : '질문을 분석하고 있습니다…'}
        </div>
      )}
    </div>
  );
}
