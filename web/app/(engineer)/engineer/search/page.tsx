"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { CytoscapeView } from "@/components/CytoscapeView";
import type { CytoscapeGraph } from "@/lib/types";

export default function EngineerSearchPage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Record<string, unknown>[]>([]);
  const [graph, setGraph] = useState<CytoscapeGraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h1 className="font-bold text-xl mb-3">의미 검색 (Engineer)</h1>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            const r = await api.search(q, "engineer");
            setHits(r.hits as Record<string, unknown>[]);
            setGraph(r.subgraph as CytoscapeGraph);
            setLoading(false);
          }}
        >
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="예: AEC-Q100 인증 MCU 대안"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="mt-2 bg-blue-600 text-white px-4 py-1.5 rounded">
            {loading ? "..." : "검색"}
          </button>
        </form>
        <ul className="mt-3 space-y-2">
          {hits.map((h, i) => (
            <li key={i} className="bg-white border rounded p-2">
              <div className="font-medium">{String(h.name ?? h.id)}</div>
              <div className="text-xs text-neutral-500">
                {String(h.id)} · score{" "}
                {typeof h.rerank_score === "number" ? h.rerank_score.toFixed(2) : "-"}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="font-bold text-lg mb-2">관련 그래프</h2>
        <CytoscapeView graph={graph} />
      </div>
    </div>
  );
}
