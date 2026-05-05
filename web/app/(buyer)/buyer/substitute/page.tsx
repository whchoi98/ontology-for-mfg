"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { CytoscapeView } from "@/components/CytoscapeView";
import type { CytoscapeGraph } from "@/lib/types";

interface SubstituteCandidate {
  id: string;
  name?: string;
  score?: number;
  shared_standards?: string[];
}

export default function BuyerSubstitutePage() {
  const [componentId, setComponentId] = useState("");
  const [candidates, setCandidates] = useState<SubstituteCandidate[]>([]);
  const [graph, setGraph] = useState<CytoscapeGraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = (await api.substitute(componentId)) as {
      candidates?: SubstituteCandidate[];
      subgraph?: CytoscapeGraph;
    };
    setCandidates(r.candidates ?? []);
    setGraph(r.subgraph ?? { nodes: [], edges: [] });
    setLoading(false);
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h1 className="font-bold text-xl mb-3">대체 부품 탐색 (Buyer)</h1>
        <form onSubmit={submit} className="flex gap-2 mb-4">
          <input
            className="flex-1 border rounded px-3 py-2"
            placeholder="예: COMP-MCU-001"
            value={componentId}
            onChange={(e) => setComponentId(e.target.value)}
          />
          <button className="bg-blue-600 text-white px-4 py-2 rounded">
            {loading ? "..." : "검색"}
          </button>
        </form>
        <ul className="space-y-2">
          {candidates.map((c, i) => (
            <li key={i} className="bg-white border rounded p-2">
              <div className="font-medium">{c.name ?? c.id}</div>
              <div className="text-xs text-neutral-500">
                score {c.score?.toFixed(2) ?? "-"} · 공통 규격:{" "}
                {c.shared_standards?.join(", ") ?? "-"}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="font-bold text-lg mb-2">공유 규격 그래프</h2>
        <CytoscapeView graph={graph} />
      </div>
    </div>
  );
}
