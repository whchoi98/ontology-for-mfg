"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/api-client";
import { useActivePersona } from "@/lib/persona-context";
import { MarkdownView } from "@/components/MarkdownView";
import type { Persona } from "@/lib/types";

interface EightDSection { section: string; title: string; content: string; }

type Sample = { label: string; persona: Persona; incidentId: string };

const EIGHTD_INCIDENTS: Sample[] = [
  { label: "INC-2026-0412 (BGA 솔더볼 균열, CRITICAL)",            persona: "quality",  incidentId: "INC-2026-0412" },
  { label: "INC-2026-0050 (PCB 박리, HIGH)",                       persona: "quality",  incidentId: "INC-2026-0050" },
  { label: "INC-2026-0100 (커패시터 누설, MID)",                   persona: "engineer", incidentId: "INC-2026-0100" },
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

const SECTION_LABELS: Record<string, string> = {
  D1: "D1 — 팀 구성 (Team Formation)",
  D2: "D2 — 문제 설명 (Problem Description)",
  D3: "D3 — 긴급 조치 (Containment Action)",
  D4: "D4 — 근본 원인 분석 (Root Cause Analysis)",
  D5: "D5 — 영구 시정 조치 (Permanent Corrective Action)",
  D6: "D6 — 시정 조치 실행 (Corrective Action Implementation)",
  D7: "D7 — 재발 방지 (Recurrence Prevention)",
  D8: "D8 — 팀 공로 인정 (Recognition)",
};

export default function EightDPage() {
  const { active, setActive } = useActivePersona();
  const [incidentId, setIncidentId] = useState("INC-2026-0412");
  const [sections, setSections] = useState<EightDSection[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set(["D1"]));
  const [loading, setLoading] = useState(false);

  async function runEightD(id?: string) {
    const target = id ?? incidentId;
    if (!target.trim()) return;
    setLoading(true);
    const r = (await api.eightD(target)) as { sections?: EightDSection[] };
    setSections(r.sections ?? []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runEightD();
  }

  function toggle(sec: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(sec) ? next.delete(sec) : next.add(sec);
      return next;
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">시나리오 J · 8D / RCA</div>
        <span className="ml-3 text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-mono">WOW</span>
        <div className="ml-auto text-xs text-ink-500">페르소나: <span className="text-ink-200 font-medium">{active}</span></div>
      </header>
      <div className="flex-1 p-6 max-w-3xl">
        <h1 className="text-2xl font-bold text-ink-50 mb-1">8D 보고서 자동 생성</h1>
        <p className="text-sm text-ink-400 mb-2">인시던트 ID 입력 → D1-D8 전체 보고서 자동 생성</p>
        <p className="text-xs text-orange-300 mb-4">★ WOW: 15초 안에 8개 섹션 전체 8D 보고서가 완성됩니다</p>

        {sections.length === 0 && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
              인시던트 선택 — 클릭하면 바로 생성됩니다
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EIGHTD_INCIDENTS.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={loading}
                  onClick={() => { setActive(p.persona); setIncidentId(p.incidentId); runEightD(p.incidentId); }}
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

        <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
          <input
            className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500"
            placeholder="인시던트 ID (예: INC-2026-0412)"
            value={incidentId}
            onChange={(e) => setIncidentId(e.target.value)}
          />
          <button
            type="submit"
            className="bg-accent-500 hover:bg-accent-400 text-ink-950 font-semibold px-4 py-2 rounded-md text-sm transition"
          >
            {loading ? "생성 중..." : "생성"}
          </button>
        </form>

        <div className="space-y-2">
          {sections.map((s) => (
            <div key={s.section} className="border border-ink-700 rounded-lg bg-ink-900 overflow-hidden">
              <button
                className="w-full flex justify-between items-center px-4 py-3 text-sm font-medium text-ink-100 hover:bg-ink-800 transition"
                onClick={() => toggle(s.section)}
              >
                <span>{SECTION_LABELS[s.section] ?? s.section}</span>
                {open.has(s.section)
                  ? <ChevronUp className="w-4 h-4 text-ink-400" />
                  : <ChevronDown className="w-4 h-4 text-ink-400" />}
              </button>
              {open.has(s.section) && (
                <div className="px-4 pb-4 border-t border-ink-700 pt-3">
                  <MarkdownView text={s.content} className="text-ink-300" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
