"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { CytoscapeView } from "@/components/CytoscapeView";
import { useActivePersona } from "@/lib/persona-context";
import type { CytoscapeGraph } from "@/lib/types";
import type { Persona } from "@/lib/types";
import { ScenarioHeader } from "@/components/ScenarioHeader";

interface SpecCandidate { id: string; name?: string; score?: number; standards?: string[]; }

type Sample = { label: string; persona: Persona };

const SPEC_SAMPLES: Sample[] = [
  { label: "AutoCockpit C7용 8\" QHD 디스플레이 모듈, 자동차 등급", persona: "engineer" },
  { label: "FC-BGA Gen5 대체 가능한 패키지 (JEDEC MO-220)",        persona: "engineer" },
  { label: "eDrive 350iPT용 800V 인버터 IGBT",                      persona: "engineer" },
  { label: "VisionOLED 88용 88\" 8K 디스플레이 드라이버 IC",        persona: "engineer" },
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

export default function SpecPage() {
  const { active, setActive } = useActivePersona();
  const [requirements, setRequirements] = useState("");
  const [candidates, setCandidates] = useState<SpecCandidate[]>([]);
  const [graph, setGraph] = useState<CytoscapeGraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);

  async function submitSpec(req?: string) {
    const text = req ?? requirements;
    setLoading(true);
    const r = (await api.specMatch(text)) as { candidates?: SpecCandidate[]; subgraph?: CytoscapeGraph };
    setCandidates(r.candidates ?? []);
    setGraph(r.subgraph ?? { nodes: [], edges: [] });
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitSpec();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="D" title="스펙 매치" tech="자연어 요구사항 → BM25 + Cohere KNN 하이브리드 + Bedrock Reranker → 후보 매칭 + 인증/리드타임 비교" />
      <div className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-50 mb-1">부품 규격 매칭</h1>
          <p className="text-sm text-ink-400 mb-4">자연어 요구사항 → 후보 부품 + 표준 커버리지 그래프</p>

          {candidates.length === 0 && (
            <div className="mb-5">
              <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
                추천 질문 — 클릭하면 바로 전송됩니다
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SPEC_SAMPLES.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={loading}
                    onClick={() => { setActive(p.persona); setRequirements(p.label); submitSpec(p.label); }}
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

          <form onSubmit={handleSubmit} className="mb-4">
            <textarea
              className="w-full bg-ink-800 border border-ink-700 rounded-md px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500"
              rows={4}
              placeholder="예: 동작 온도 -40~125°C, 정격 전압 5V, AEC-Q100 Grade 0, SOP-8 패키지"
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
            />
            <button
              type="submit"
              className="mt-2 bg-accent-500 hover:bg-accent-400 text-ink-950 font-semibold px-4 py-2 rounded-md text-sm transition"
            >
              {loading ? "매칭 중..." : "매칭"}
            </button>
          </form>
          <ul className="space-y-2">
            {candidates.map((c, i) => (
              <li key={i} className="bg-ink-800 border border-ink-700 rounded-lg p-3">
                <div className="font-semibold text-ink-100 text-sm">{c.name ?? c.id}</div>
                <div className="text-xs text-ink-400 mt-1">
                  score {c.score?.toFixed(3) ?? "-"} · 규격: {c.standards?.join(", ") ?? "-"}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink-100 mb-2">규격 그래프</h2>
          <CytoscapeView graph={graph} />
        </div>
      </div>
    </div>
  );
}
