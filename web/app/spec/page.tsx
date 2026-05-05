"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { CytoscapeView } from "@/components/CytoscapeView";
import { useActivePersona } from "@/lib/persona-context";
import type { CytoscapeGraph } from "@/lib/types";

interface SpecCandidate { id: string; name?: string; score?: number; standards?: string[]; }

export default function SpecPage() {
  const { active } = useActivePersona();
  const [requirements, setRequirements] = useState("");
  const [candidates, setCandidates] = useState<SpecCandidate[]>([]);
  const [graph, setGraph] = useState<CytoscapeGraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = (await api.specMatch(requirements)) as { candidates?: SpecCandidate[]; subgraph?: CytoscapeGraph };
    setCandidates(r.candidates ?? []);
    setGraph(r.subgraph ?? { nodes: [], edges: [] });
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">시나리오 D · 스펙 매치</div>
        <div className="ml-auto text-xs text-ink-500">페르소나: <span className="text-ink-200 font-medium">{active}</span></div>
      </header>
      <div className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-50 mb-1">부품 규격 매칭</h1>
          <p className="text-sm text-ink-400 mb-4">자연어 요구사항 → 후보 부품 + 표준 커버리지 그래프</p>
          <form onSubmit={submit} className="mb-4">
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
