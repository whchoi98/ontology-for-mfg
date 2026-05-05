"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/api-client";
import { useActivePersona } from "@/lib/persona-context";

interface EightDSection { section: string; title: string; content: string; }

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
  const { active } = useActivePersona();
  const [incidentId, setIncidentId] = useState("INC-2026-0412");
  const [sections, setSections] = useState<EightDSection[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set(["D1"]));
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = (await api.eightD(incidentId)) as { sections?: EightDSection[] };
    setSections(r.sections ?? []);
    setLoading(false);
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
        <form onSubmit={submit} className="flex gap-2 mb-6">
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
                <div className="px-4 pb-4 text-sm text-ink-300 border-t border-ink-700 pt-3 leading-relaxed">
                  {s.content}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
