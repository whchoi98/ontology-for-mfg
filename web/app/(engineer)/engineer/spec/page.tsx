"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { CytoscapeView } from "@/components/CytoscapeView";
import type { CytoscapeGraph } from "@/lib/types";

interface SpecCandidate {
  id: string;
  name?: string;
  score?: number;
  standards?: string[];
}

export default function EngineerSpecPage() {
  const [requirements, setRequirements] = useState("");
  const [candidates, setCandidates] = useState<SpecCandidate[]>([]);
  const [graph, setGraph] = useState<CytoscapeGraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = (await api.specMatch(requirements)) as {
      candidates?: SpecCandidate[];
      subgraph?: CytoscapeGraph;
    };
    setCandidates(r.candidates ?? []);
    setGraph(r.subgraph ?? { nodes: [], edges: [] });
    setLoading(false);
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h1 className="font-bold text-xl mb-3">부품 규격 매칭 (Engineer)</h1>
        <form onSubmit={submit} className="mb-4">
          <textarea
            className="w-full border rounded px-3 py-2 text-sm"
            rows={4}
            placeholder="예: 동작 온도 -40~125°C, 정격 전압 5V, AEC-Q100 Grade 0, SOP-8 패키지"
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
          />
          <button className="mt-2 bg-blue-600 text-white px-4 py-1.5 rounded">
            {loading ? "..." : "매칭"}
          </button>
        </form>
        <ul className="space-y-2">
          {candidates.map((c, i) => (
            <li key={i} className="bg-white border rounded p-2">
              <div className="font-medium">{c.name ?? c.id}</div>
              <div className="text-xs text-neutral-500">
                score {c.score?.toFixed(2) ?? "-"} · 규격:{" "}
                {c.standards?.join(", ") ?? "-"}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="font-bold text-lg mb-2">규격 그래프</h2>
        <CytoscapeView graph={graph} />
      </div>
    </div>
  );
}
