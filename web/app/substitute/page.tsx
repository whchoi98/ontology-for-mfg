"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { CytoscapeView } from "@/components/CytoscapeView";
import { useActivePersona } from "@/lib/persona-context";
import type { CytoscapeGraph } from "@/lib/types";

interface SubstituteCandidate { id: string; name?: string; score?: number; shared_standards?: string[]; }

export default function SubstitutePage() {
  const { active } = useActivePersona();
  const [componentId, setComponentId] = useState("");
  const [candidates, setCandidates] = useState<SubstituteCandidate[]>([]);
  const [graph, setGraph] = useState<CytoscapeGraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = (await api.substitute(componentId)) as { candidates?: SubstituteCandidate[]; subgraph?: CytoscapeGraph };
    setCandidates(r.candidates ?? []);
    setGraph(r.subgraph ?? { nodes: [], edges: [] });
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">시나리오 F · 대체 부품</div>
        <div className="ml-auto text-xs text-ink-500">페르소나: <span className="text-ink-200 font-medium">{active}</span></div>
      </header>
      <div className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-50 mb-1">대체 부품 탐색</h1>
          <p className="text-sm text-ink-400 mb-4">공급 중단·단종 시 동일 기능·공유 표준 기반 대안 산출</p>
          <form onSubmit={submit} className="flex gap-2 mb-4">
            <input
              className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500"
              placeholder="예: COMP-MCU-001"
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
