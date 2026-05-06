"use client";
import { useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { api } from "@/lib/api-client";
import { CytoscapeView } from "@/components/CytoscapeView";
import { useActivePersona } from "@/lib/persona-context";
import type { CytoscapeGraph } from "@/lib/types";
import type { Persona } from "@/lib/types";

type Sample = { label: string; persona: Persona };

const SEARCH_SAMPLES: Sample[] = [
  { label: "차량용 -40°C 보장 BGA 패키지",                         persona: "engineer" },
  { label: "AEC-Q100 Grade 2 + ISO 26262 ASIL-B 부품",            persona: "engineer" },
  { label: "RoHS 통과 PCB 어셈블리",                              persona: "engineer" },
  { label: "1차 협력사 OTD 95% 이상",                              persona: "buyer" },
  { label: "MX 공장 lead time 14일 이내 부품",                     persona: "buyer" },
  { label: "FC-BGA Gen5 신뢰성 시험 통과 부품",                    persona: "engineer" },
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

// Phase chips for search pipeline visualization (frontend simulation)
interface PhaseChip { name: string; label: string; tone: string; }
const PHASE_TONES: Record<string, string> = {
  bm25:    "border-blue-500/40    bg-blue-500/10    text-blue-200",
  knn:     "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  rrf:     "border-amber-500/40   bg-amber-500/10   text-amber-200",
  rerank:  "border-rose-500/40    bg-rose-500/10    text-rose-200",
  neptune: "border-violet-500/40  bg-violet-500/10  text-violet-200",
};

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export default function SearchPage() {
  const { active, setActive } = useActivePersona();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Record<string, unknown>[]>([]);
  const [graph, setGraph] = useState<CytoscapeGraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);
  const [phases, setPhases] = useState<PhaseChip[]>([]);

  async function doSearch(query: string) {
    if (!query.trim()) return;
    setLoading(true);
    setHits([]);
    setPhases([]);

    // Simulate pipeline phase chips while awaiting real API
    setPhases([{ name: "bm25", label: "BM25 (Nori 한글)", tone: PHASE_TONES.bm25 }]);
    await sleep(150);
    setPhases((p) => [...p, { name: "knn", label: "Cohere embed-v3 KNN", tone: PHASE_TONES.knn }]);
    await sleep(150);
    setPhases((p) => [...p, { name: "rrf", label: "RRF fusion", tone: PHASE_TONES.rrf }]);
    await sleep(150);
    setPhases((p) => [...p, { name: "rerank", label: "Bedrock Reranker", tone: PHASE_TONES.rerank }]);

    const r = await api.search(query, active);
    setHits(r.hits as Record<string, unknown>[]);
    setPhases((p) => [...p, { name: "neptune", label: "Neptune subgraph", tone: PHASE_TONES.neptune }]);
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

          {hits.length === 0 && (
            <div className="mb-5">
              <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
                추천 질문 — 클릭하면 바로 전송됩니다
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SEARCH_SAMPLES.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={loading}
                    onClick={() => { setActive(p.persona); setQ(p.label); doSearch(p.label); }}
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

          {/* Pipeline phase chips — visible while loading or just after */}
          {(loading || phases.length > 0) && hits.length === 0 && (
            <div className="mb-5 p-4 rounded-lg border border-ink-700 bg-ink-900">
              <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2 flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
                검색 파이프라인 진행 중 — {phases.length}단계 완료
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
            </div>
          )}

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
