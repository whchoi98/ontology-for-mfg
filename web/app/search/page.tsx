"use client";
import { useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { api } from "@/lib/api-client";
import { CytoscapeView } from "@/components/CytoscapeView";
import { useActivePersona } from "@/lib/persona-context";
import type { CytoscapeGraph } from "@/lib/types";

const SUGGESTIONS: Record<string, string[]> = {
  buyer:    ["차량용 -40°C BGA MCU", "AEC-Q100 Grade 0 SOP-8"],
  engineer: ["REACH SVHC 미함유 적층 커패시터", "IPC-A-610 Class 3 기판"],
  quality:  ["RoHS 위반 이력 부품", "PFAS 함유 원자재"],
  scm:      ["납기 지연 위험 공급사", "멕시코산 USMCA 적격 부품"],
  plant:    ["IoT 센서 이상 감지 부품", "예지보전 필요 장비"],
};

export default function SearchPage() {
  const { active } = useActivePersona();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Record<string, unknown>[]>([]);
  const [graph, setGraph] = useState<CytoscapeGraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);

  async function doSearch(query: string) {
    if (!query.trim()) return;
    setLoading(true);
    const r = await api.search(query, active);
    setHits(r.hits as Record<string, unknown>[]);
    setGraph(r.subgraph as CytoscapeGraph);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6 pt-0">
        <div className="text-xs text-ink-400">시나리오 A · 의미 검색</div>
        <span className="ml-3 text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-mono">WOW</span>
        <div className="ml-auto text-xs text-ink-500">페르소나: <span className="text-ink-200 font-medium">{active}</span></div>
      </header>

      <div className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-50 mb-1">의미 검색</h1>
          <p className="text-sm text-ink-400 mb-4">자연어 → BM25 + Cohere KNN 하이브리드 + Bedrock Reranker → 1-hop 그래프</p>

          <form
            onSubmit={(e) => { e.preventDefault(); doSearch(q); }}
            className="mb-4"
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                <input
                  className="w-full bg-ink-800 border border-ink-700 rounded-md pl-10 pr-3 py-2.5 text-sm text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500"
                  placeholder="예: 차량용 -40°C 보장 BGA 패키지"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="bg-accent-500 hover:bg-accent-400 text-ink-950 font-semibold px-4 py-2 rounded-md text-sm transition"
              >
                {loading ? "검색 중..." : "검색"}
              </button>
            </div>
          </form>

          <div className="mb-4 flex flex-wrap gap-2">
            {(SUGGESTIONS[active] ?? SUGGESTIONS.buyer).map((s) => (
              <button
                key={s}
                onClick={() => { setQ(s); doSearch(s); }}
                className="text-xs px-2.5 py-1 rounded-md bg-ink-800 border border-ink-700 text-ink-300 hover:border-accent-500/50 hover:text-ink-100 transition"
              >
                {s}
              </button>
            ))}
          </div>

          <ul className="space-y-2">
            {hits.map((h, i) => (
              <li key={i} className="bg-ink-800 border border-ink-700 rounded-lg p-3">
                <div className="font-semibold text-ink-100 text-sm">{String(h.name ?? h.id)}</div>
                <div className="flex items-center gap-2 mt-1 text-xs text-ink-400">
                  <span className="font-mono">{String(h.id)}</span>
                  {typeof h.rerank_score === "number" && (
                    <span className="px-1.5 py-0.5 rounded bg-accent-500/15 text-accent-300 font-mono">
                      score {h.rerank_score.toFixed(3)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col">
          <h2 className="text-lg font-semibold text-ink-100 mb-2">관련 그래프 (1-hop)</h2>
          <p className="text-xs text-ink-400 mb-3">★ 노드를 클릭하면 해당 객체 세부 정보를 확인할 수 있습니다</p>
          <div className="flex-1 min-h-[400px]">
            <CytoscapeView graph={graph} />
          </div>
        </div>
      </div>
    </div>
  );
}
