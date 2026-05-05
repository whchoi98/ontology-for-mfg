"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { KpiStrip } from "@/components/KpiStrip";
import { useActivePersona } from "@/lib/persona-context";
import type { Persona } from "@/lib/types";

interface KpiRow { label: string; value: string; delta?: string; }

type Sample = { label: string; persona: Persona };

const INSIGHTS_SAMPLES: Sample[] = [
  { label: "지난 12주 1차 협력사 평균 OTD",                        persona: "quality" },
  { label: "Plant별 Scope 1·2·3 탄소 배출 분포",                   persona: "scm" },
  { label: "분기별 품질 인시던트 추이 (CRITICAL/HIGH)",            persona: "quality" },
  { label: "EU 수출 lane의 CBAM 노출액 trend",                     persona: "scm" },
  { label: "Tier-1 협력사 RFM 분포 (recency × monetary)",          persona: "buyer" },
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

export default function InsightsPage() {
  const { active, setActive } = useActivePersona();
  const [question, setQuestion] = useState("");
  const [summary, setSummary] = useState("");
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit(q?: string) {
    const text = q ?? question;
    if (!text.trim()) return;
    setLoading(true);
    const r = (await api.insights(text, active)) as { summary?: string; rows?: KpiRow[] };
    setSummary(r.summary ?? "");
    setKpis(r.rows ?? []);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">시나리오 C · 인사이트</div>
        <div className="ml-auto text-xs text-ink-500">페르소나: <span className="text-ink-200 font-medium">{active}</span></div>
      </header>
      <div className="flex-1 p-6 max-w-4xl">
        <h1 className="text-2xl font-bold text-ink-50 mb-1">인사이트</h1>
        <p className="text-sm text-ink-400 mb-4">Neptune 집계 + Sonnet 4.6 스트리밍 + Code Interpreter 차트</p>

        {!summary && kpis.length === 0 && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
              추천 질문 — 클릭하면 바로 전송됩니다
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {INSIGHTS_SAMPLES.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={loading}
                  onClick={() => { setActive(p.persona); setQuestion(p.label); submit(p.label); }}
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

        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500"
            placeholder="예: 상위 5개 공급업체의 납기 준수율은?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button
            onClick={() => submit()}
            className="bg-accent-500 hover:bg-accent-400 text-ink-950 font-semibold px-4 py-2 rounded-md text-sm transition"
          >
            {loading ? "조회 중..." : "조회"}
          </button>
        </div>

        {kpis.length > 0 && <div className="mb-6"><KpiStrip kpis={kpis} /></div>}
        {summary && (
          <div className="bg-ink-800 border border-ink-700 rounded-lg p-5 text-sm text-ink-200 leading-relaxed whitespace-pre-wrap">
            {summary}
          </div>
        )}
      </div>
    </div>
  );
}
