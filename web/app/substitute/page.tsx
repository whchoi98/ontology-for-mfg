"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { CytoscapeView } from "@/components/CytoscapeView";
import { useActivePersona } from "@/lib/persona-context";
import type { CytoscapeGraph } from "@/lib/types";
import type { Persona } from "@/lib/types";
import { ScenarioHeader } from "@/components/ScenarioHeader";

interface SubstituteCandidate { id: string; name?: string; score?: number; shared_standards?: string[]; }

type Sample = { label: string; persona: Persona; value: string; };

const SUB_SAMPLES: Sample[] = [
  { label: "AMZN-CMP-IC-00001 EOL 대체품 후보",        persona: "engineer", value: "AMZN-CMP-IC-00001" },
  { label: "MX 공장 내 동일 사양 대체 (단가 차이)",    persona: "buyer",    value: "COMP-MCU-001" },
  { label: "단종된 PCB 어셈블리 대체 추천",            persona: "engineer", value: "COMP-PCB-001" },
  { label: "RoHS 통과 대체 부품 (현재 위반)",          persona: "quality",  value: "COMP-CAP-001" },
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

export default function SubstitutePage() {
  const { active, setActive } = useActivePersona();
  const [componentId, setComponentId] = useState("");
  const [candidates, setCandidates] = useState<SubstituteCandidate[]>([]);
  const [graph, setGraph] = useState<CytoscapeGraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);

  async function run(id: string) {
    if (!id.trim()) return;
    setLoading(true);
    const r = (await api.substitute(id)) as { candidates?: SubstituteCandidate[]; subgraph?: CytoscapeGraph };
    setCandidates(r.candidates ?? []);
    setGraph(r.subgraph ?? { nodes: [], edges: [] });
    setLoading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(componentId);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="F" title="대체 부품 추천" tech="Cypher CONFORMS_TO 표준 매치 → 동일 카테고리 + 인증 fanout → 가격/리드타임/RoHS 비교" />
      <div className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-50 mb-1">대체 부품 탐색</h1>
          <p className="text-sm text-ink-400 mb-4">공급 중단·단종 시 동일 기능·공유 표준 기반 대안 산출</p>

          {candidates.length === 0 && !loading && (
            <div className="mb-5">
              <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
                추천 질문 — 클릭하면 바로 전송됩니다
              </div>
              <div className="grid grid-cols-1 gap-2">
                {SUB_SAMPLES.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={loading}
                    onClick={() => { setActive(p.persona); setComponentId(p.value); run(p.value); }}
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

          <form onSubmit={submit} className="flex gap-2 mb-4">
            <input
              className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500"
              placeholder="예: AMZN-CMP-IC-00001"
              value={componentId}
              onChange={(e) => setComponentId(e.target.value)}
            />
            <button
              type="submit"
              className="bg-accent-500 hover:bg-accent-400 text-ink-950 font-semibold px-4 py-2 rounded-md text-sm transition"
            >
              {loading ? "검색 중..." : "검색"}
            </button>
          </form>
          <ul className="space-y-2">
            {candidates.map((c, i) => (
              <li key={i} className="bg-ink-800 border border-ink-700 rounded-lg p-3">
                <div className="font-semibold text-ink-100 text-sm">{c.name ?? c.id}</div>
                <div className="text-xs text-ink-400 mt-1">
                  score {c.score?.toFixed(3) ?? "-"} · 공통 규격: {c.shared_standards?.join(", ") ?? "-"}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink-100 mb-2">공유 규격 그래프</h2>
          <CytoscapeView graph={graph} />
        </div>
      </div>
    </div>
  );
}
