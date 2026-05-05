"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { KpiStrip } from "@/components/KpiStrip";
import { useActivePersona } from "@/lib/persona-context";

interface KpiRow { label: string; value: string; delta?: string; }

const SUGGESTIONS: Record<string, string[]> = {
  buyer:    ["상위 5개 공급업체 납기 준수율은?", "지난 분기 최다 발주 부품 Top10"],
  engineer: ["AEC-Q100 미인증 부품 현황", "RoHS 위반 위험 성분 통계"],
  quality:  ["최근 3개월 품질 인시던트 추이", "8D 평균 해결 기간은?"],
  scm:      ["지역별 공급망 리스크 요약", "현재 지연 중인 Lane 현황"],
  plant:    ["공장별 Scope 1/2 탄소 배출 비교", "예지보전 알람 발생 빈도"],
};

export default function InsightsPage() {
  const { active } = useActivePersona();
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

        <div className="flex flex-wrap gap-2 mb-6">
          {(SUGGESTIONS[active] ?? SUGGESTIONS.buyer).map((s) => (
            <button
              key={s}
              onClick={() => { setQuestion(s); submit(s); }}
              className="text-xs px-2.5 py-1 rounded-md bg-ink-800 border border-ink-700 text-ink-300 hover:border-accent-500/50 transition"
            >
              {s}
            </button>
          ))}
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
