"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { KpiStrip } from "@/components/KpiStrip";
import { MarkdownView } from "@/components/MarkdownView";
import { useActivePersona } from "@/lib/persona-context";
import type { Persona } from "@/lib/types";
import { ScenarioHeader } from "@/components/ScenarioHeader";

interface KpiRow { label: string; value: string; delta?: string; }
interface ChartItem { label: string; value: number; }

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

// Pipeline phase chips for insights
interface PhaseChip { name: string; label: string; tone: string; }
const PHASE_META: Record<string, { label: string; tone: string }> = {
  neptune: { label: "Neptune 집계", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" },
  bedrock: { label: "Sonnet 4.6 분석", tone: "border-orange-500/40 bg-orange-500/10 text-orange-200" },
};

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export default function InsightsPage() {
  const { active, setActive } = useActivePersona();
  const [question, setQuestion] = useState("");
  const [summary, setSummary] = useState("");
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [chart, setChart] = useState<ChartItem[]>([]);
  const [chartTitle, setChartTitle] = useState("");
  const [phases, setPhases] = useState<PhaseChip[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  async function submit(q?: string) {
    const text = q ?? question;
    if (!text.trim()) return;
    setLoading(true);
    setSummary("");
    setKpis([]);
    setChart([]);
    setChartTitle("");
    setPhases([]);
    setStreamingText("");

    // Simulate pipeline phases
    const neptuneMeta = PHASE_META.neptune;
    setPhases([{ name: "neptune", ...neptuneMeta }]);
    await sleep(300);
    const bedrockMeta = PHASE_META.bedrock;
    setPhases((p) => [...p, { name: "bedrock", ...bedrockMeta }]);

    const r = (await api.insights(text, active)) as {
      summary?: string;
      rows?: KpiRow[];
      chart_spec?: { title?: string; data?: ChartItem[] };
    };

    setSummary(r.summary ?? "");
    setKpis(r.rows ?? []);
    if (r.chart_spec?.data?.length) {
      setChart(r.chart_spec.data);
      setChartTitle(r.chart_spec.title ?? "");
    }
    setLoading(false);
  }

  const maxValue = chart.length > 0 ? Math.max(...chart.map((d) => d.value), 1) : 1;
  const isDone = !loading && (summary || kpis.length > 0 || chart.length > 0);

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="C" title="인사이트" tech="Neptune 집계 + Sonnet 4.6 분석 (마크다운 스트리밍) + Code Interpreter 차트 + Cytoscape 드릴다운" />
      <div className="flex-1 mx-auto w-full max-w-4xl px-6 py-6">
        <h1 className="text-2xl font-bold text-ink-50 mb-1">인사이트</h1>
        <p className="text-sm text-ink-400 mb-4">Neptune 집계 + Sonnet 4.6 스트리밍 + Code Interpreter 차트</p>

        {!summary && kpis.length === 0 && !loading && (
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

        {/* Pipeline phase strip */}
        {(loading || phases.length > 0) && !isDone && (
          <div className="mb-5 p-4 rounded-lg border border-ink-700 bg-ink-900 space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
              인사이트 파이프라인 진행 중 — {phases.length}단계 완료
            </div>
            <ol className="flex flex-wrap gap-2">
              {phases.map((p, i) => (
                <li key={i} className={`flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded border ${p.tone}`}>
                  <span className="text-[9px] opacity-60">{i + 1}.</span>
                  <span className="font-semibold">{p.label}</span>
                </li>
              ))}
              {loading && (
                <li className="text-[11px] font-mono px-2 py-1 rounded border border-ink-600/30 bg-ink-800/50 text-ink-400 animate-pulse">
                  다음 단계…
                </li>
              )}
            </ol>
            {streamingText && (
              <div className="border-t border-ink-700 pt-3 text-sm text-ink-300 leading-relaxed whitespace-pre-wrap">
                {streamingText}
              </div>
            )}
          </div>
        )}

        {kpis.length > 0 && <div className="mb-6"><KpiStrip kpis={kpis} /></div>}

        {/* Bar chart from chart_spec.data */}
        {chart.length > 0 && (
          <div className="mb-6 bg-ink-800 border border-ink-700 rounded-lg p-5">
            {chartTitle && <h2 className="text-sm font-semibold text-ink-100 mb-4">{chartTitle}</h2>}
            <ul className="space-y-2">
              {chart.map((d, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-36 text-xs text-ink-300 truncate shrink-0">{d.label}</div>
                  <div className="flex-1 h-5 bg-ink-900 rounded">
                    <div
                      className="h-5 bg-gradient-to-r from-accent-500 to-rose-500 rounded transition-all"
                      style={{ width: `${(d.value / maxValue) * 100}%` }}
                    />
                  </div>
                  <div className="w-12 text-xs text-right font-mono text-ink-200 tabular-nums">{d.value}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary && (
          <div className="bg-ink-800 border border-ink-700 rounded-lg p-5">
            <MarkdownView text={summary} />
          </div>
        )}
      </div>
    </div>
  );
}
