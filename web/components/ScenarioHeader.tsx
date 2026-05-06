"use client";
// Per-scenario top header — shows scenario badge (A-L), Korean title,
// technology pipeline (BM25/KNN/RRF/Reranker/Cypher/etc.), active persona.
// Used by all 12 scenario pages + objects/[type] explorer.

import { useActivePersona } from "@/lib/persona-context";

interface Props {
  scenario?: string;          // "A" .. "L" (omit for objects/meta pages)
  title: string;              // 의미 검색
  tech: string;               // 자연어 → BM25 + Cohere KNN + ... → 1-hop 그래프
  wow?: boolean;              // show WOW badge (A/B/H/J wow moments)
  showPersona?: boolean;      // default true
  rightSlot?: React.ReactNode;// optional extras (counts, toggle buttons)
}

const PERSONA_LABEL: Record<string, string> = {
  buyer: "Buyer 구매",
  engineer: "Engineer R&D",
  quality: "Quality 품질",
  scm: "SCM 공급망",
  plant: "Plant 생산",
};

export function ScenarioHeader({ scenario, title, tech, wow, showPersona = true, rightSlot }: Props) {
  const persona = useActivePersona();
  return (
    <header className="border-b border-ink-700 bg-ink-900 px-6 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="flex items-center gap-2 shrink-0">
        {scenario && (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded border border-accent-500/40 bg-accent-500/10 text-accent-200 font-bold">
            시나리오 {scenario}
          </span>
        )}
        <h1 className="text-sm font-semibold text-ink-100">{title}</h1>
        {wow && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-mono font-bold">
            WOW
          </span>
        )}
      </div>
      <div className="text-[11px] text-ink-400 font-mono leading-snug min-w-0 flex-1">
        {tech}
      </div>
      {showPersona && persona.active && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-orange-500/40 bg-orange-500/10 text-orange-200 shrink-0">
          {PERSONA_LABEL[persona.active] ?? persona.active}
        </span>
      )}
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </header>
  );
}
