"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeftRight, Sparkles, Tag, Layers, Search as SearchIcon, Cpu, Truck, ShieldCheck } from "lucide-react";

import { api } from "@/lib/api-client";
import { ScenarioHeader } from "@/components/ScenarioHeader";
import { useActivePersona } from "@/lib/persona-context";
import type { Persona } from "@/lib/types";

const CytoscapeView = dynamic(
  () => import("@/components/CytoscapeView").then((m) => m.CytoscapeView),
  { ssr: false },
);

interface SampleComponent { id: string; name: string; category: string; leadtime_days?: number; unit_price_usd?: number }

interface SubCandidate {
  id: string; name: string; category: string;
  supplier_id: string; supplier_name: string;
  unit_price_usd: number; price_delta_pct: number;
  leadtime_days: number; leadtime_delta_days: number;
  rohs_compliant: boolean;
  shared_standards: string[]; spec_tags: string[];
  stock_status: string; score: number;
}

interface SubResponse {
  original: { id: string; name: string; category: string; supplier_name: string;
              unit_price_usd: number; leadtime_days: number; rohs_compliant: boolean;
              standards: string[]; stock_status: string };
  candidates: SubCandidate[];
  subgraph: { nodes: Array<{ data: { id: string; label?: string; [k: string]: unknown } }>;
              edges: Array<{ data: { id: string; source: string; target: string; type?: string } }> };
  summary: { min_price_delta_pct: number; max_price_delta_pct: number; rohs_compliant_count: number; fastest_leadtime_days: number };
}

type Sample = { label: string; persona: Persona; cid: string };
const SAMPLES: Sample[] = [
  { label: "AMZN-CMP-IC-00001 EOL 대체",         persona: "engineer", cid: "AMZN-CMP-IC-00001" },
  { label: "AMZN-CMP-PCB-00002 동일사양",       persona: "buyer",    cid: "AMZN-CMP-PCB-00002" },
  { label: "AMZN-CMP-DIS-00003 단종 대체",       persona: "engineer", cid: "AMZN-CMP-DIS-00003" },
  { label: "AMZN-CMP-IC-00007 RoHS 통과 대체",   persona: "quality",  cid: "AMZN-CMP-IC-00007" },
];
const PERSONA_TONE: Record<Persona, string> = {
  buyer:    "border-blue-500/40    bg-blue-500/10    text-blue-200",
  engineer: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  quality:  "border-amber-500/40   bg-amber-500/10   text-amber-200",
  scm:      "border-rose-500/40    bg-rose-500/10    text-rose-200",
  plant:    "border-violet-500/40  bg-violet-500/10  text-violet-200",
};
const PERSONA_LABEL: Record<Persona, string> = { buyer:"Buyer 구매", engineer:"Engineer R&D", quality:"Quality 품질", scm:"SCM 공급망", plant:"Plant 생산" };

export default function SubstitutePage() {
  const { setActive } = useActivePersona();
  const [samples, setSamples] = useState<SampleComponent[] | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<SubResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sameSupplierOk, setSameSupplierOk] = useState(false);

  useEffect(() => {
    api.substituteSamples(15)
      .then((r) => setSamples((r as { items: SampleComponent[] }).items))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true); setError(null); setResult(null);
    (api.substitute(selected, sameSupplierOk, 8) as Promise<SubResponse>)
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected, sameSupplierOk]);

  const filteredSamples = (samples ?? []).filter((p) => {
    if (!filter.trim()) return true;
    const f = filter.trim().toLowerCase();
    return p.name.toLowerCase().includes(f) || p.id.toLowerCase().includes(f);
  });

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="F" title="대체 부품 추천"
        tech="Cypher CONFORMS_TO 표준 매치 → 동일 카테고리 + 인증 fanout → 가격/리드타임/RoHS 비교" />
      <div className="flex-1 grid xl:grid-cols-[340px_1fr_360px] min-h-0">
        {/* ═══ Left Picker ═══ */}
        <aside className="border-r border-ink-700 bg-ink-900 flex flex-col min-h-0">
          <div className="p-4 border-b border-ink-700">
            <h2 className="text-sm font-semibold text-ink-100 flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-cyan-400" /> 원본 부품
            </h2>
            <p className="text-[10px] text-ink-400 mt-1 leading-relaxed">
              표준 fanout 기준 상위 15개. 클릭하면 같은 카테고리 + 동일 표준 대안을 점수 순으로 추천.
            </p>
          </div>
          {!selected && (
            <div className="p-3 border-b border-ink-700 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">추천</div>
              {SAMPLES.map((s, i) => (
                <button key={i} onClick={() => { setActive(s.persona); setSelected(s.cid); }}
                  className="w-full text-left px-2 py-1.5 rounded border border-ink-700 bg-ink-800 hover:border-cyan-500/60 transition flex items-center gap-2">
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${PERSONA_TONE[s.persona]}`}>{PERSONA_LABEL[s.persona]}</span>
                  <span className="text-[11px] text-ink-200 truncate">{s.label}</span>
                </button>
              ))}
            </div>
          )}
          <div className="px-3 py-2 border-b border-ink-700 relative">
            <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-500" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="부품 필터"
              className="w-full rounded bg-ink-800 border border-ink-700 text-xs pl-8 pr-3 py-1.5 text-ink-100 outline-none focus:border-cyan-500 placeholder:text-ink-500" />
          </div>
          <div className="px-4 py-2 border-b border-ink-700 flex items-center gap-2 text-xs">
            <input type="checkbox" id="same-supplier" checked={sameSupplierOk}
              onChange={(e) => setSameSupplierOk(e.target.checked)} className="accent-cyan-500" />
            <label htmlFor="same-supplier" className="text-ink-300">같은 협력사 허용</label>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {!samples && <li className="text-xs text-ink-500 italic p-4">로딩 중…</li>}
            {filteredSamples.map((p) => {
              const active = p.id === selected;
              return (
                <li key={p.id}>
                  <button onClick={() => setSelected(p.id)}
                    className={["w-full text-left px-4 py-2.5 border-b border-ink-700/40 transition",
                      active ? "bg-cyan-500/10 border-l-2 border-l-cyan-500" : "hover:bg-ink-800"].join(" ")}>
                    <div className={`text-sm font-medium truncate ${active ? "text-cyan-200" : "text-ink-100"}`}>{p.name}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ink-400 font-mono">
                      <span>{p.id}</span><span>·</span><span>{p.category}</span>
                      {p.unit_price_usd != null && <><span>·</span><span>${p.unit_price_usd.toFixed(2)}</span></>}
                      {p.leadtime_days != null && <><span>·</span><span>{p.leadtime_days}d</span></>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ═══ Center ═══ */}
        <section className="flex flex-col min-h-0 overflow-y-auto">
          <div className="px-6 py-5">
            <h1 className="text-2xl font-bold text-ink-50 mb-1 flex items-center gap-2">
              <ArrowLeftRight className="w-6 h-6 text-cyan-400" /> 대체 부품 추천
            </h1>
            <p className="text-sm text-ink-400">같은 카테고리 + 동일 표준 + 가격/리드타임 근접도 = 점수.</p>
          </div>
          {error && <div className="mx-6 mb-4 p-3 rounded-md bg-red-500/10 text-red-300 border border-red-500/30 text-sm">{error}</div>}
          {loading && <div className="mx-6 text-sm text-ink-400">분석 중…</div>}
          {result && (
            <div className="px-6 pb-6 space-y-5">
              <article className="p-5 rounded-lg border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-cyan-500/0">
                <div className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold mb-1">Original</div>
                <h2 className="text-lg font-bold text-ink-50">{result.original.name}</h2>
                <div className="flex flex-wrap gap-2 text-[10px] font-mono text-ink-300 mt-2">
                  <span>{result.original.id}</span>
                  <span><Layers className="inline w-3 h-3 mr-1" />{result.original.category}</span>
                  <span><Tag className="inline w-3 h-3 mr-1" />{result.original.supplier_name}</span>
                  <span>${result.original.unit_price_usd.toFixed(2)}</span>
                  <span>{result.original.leadtime_days}일</span>
                  <span className={result.original.rohs_compliant ? "text-emerald-300" : "text-rose-300"}>
                    RoHS {result.original.rohs_compliant ? "통과" : "위반"}
                  </span>
                  <span>재고: {result.original.stock_status}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {result.original.standards.map((s) => (
                    <span key={s} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">{s}</span>
                  ))}
                </div>
              </article>

              {result.summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="단가 편차 (min)" value={`${result.summary.min_price_delta_pct > 0 ? "+" : ""}${result.summary.min_price_delta_pct}%`} tone={result.summary.min_price_delta_pct < 0 ? "good" : "warn"} />
                  <Stat label="단가 편차 (max)" value={`${result.summary.max_price_delta_pct > 0 ? "+" : ""}${result.summary.max_price_delta_pct}%`} tone={result.summary.max_price_delta_pct < 0 ? "good" : "warn"} />
                  <Stat label="RoHS 통과" value={`${result.summary.rohs_compliant_count}/${result.candidates.length}`} tone="good" />
                  <Stat label="최단 리드타임" value={`${result.summary.fastest_leadtime_days}일`} />
                </div>
              )}

              <article>
                <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-cyan-400" /> 대체 부품 후보 ({result.candidates.length})
                </h3>
                <ul className="space-y-2">
                  {result.candidates.map((c) => (
                    <li key={c.id} className="p-3 rounded-md border border-ink-700 bg-ink-800 hover:border-cyan-500/40 transition">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink-100 font-medium truncate">{c.name}</div>
                          <div className="text-[10px] font-mono text-ink-500 mt-0.5">{c.id}</div>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-1 rounded bg-cyan-500/15 text-cyan-200 shrink-0 font-bold">score {c.score}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                        <span className="text-[10px] font-mono text-ink-400"><Tag className="inline w-3 h-3 mr-0.5" />{c.supplier_name}</span>
                        <span className="text-[10px] font-mono text-ink-400">·</span>
                        <span className="text-[10px] font-mono text-ink-400">
                          ${c.unit_price_usd.toFixed(2)}
                          <span className={c.price_delta_pct > 0 ? "text-amber-300 ml-1" : "text-emerald-300 ml-1"}>
                            {c.price_delta_pct > 0 ? "+" : ""}{c.price_delta_pct}%
                          </span>
                        </span>
                        <span className="text-[10px] font-mono text-ink-400">·</span>
                        <span className="text-[10px] font-mono text-ink-400">
                          <Truck className="inline w-3 h-3 mr-0.5" />{c.leadtime_days}일
                          {c.leadtime_delta_days !== 0 && (
                            <span className={c.leadtime_delta_days > 0 ? "text-amber-300 ml-1" : "text-emerald-300 ml-1"}>
                              ({c.leadtime_delta_days > 0 ? "+" : ""}{c.leadtime_delta_days})
                            </span>
                          )}
                        </span>
                        {c.shared_standards.length > 0 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            <ShieldCheck className="inline w-3 h-3 mr-0.5" />표준 +{c.shared_standards.length}
                          </span>
                        )}
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          c.rohs_compliant ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                        }`}>RoHS {c.rohs_compliant ? "통과" : "위반"}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-700 text-ink-300">재고: {c.stock_status}</span>
                      </div>
                      {c.shared_standards.length > 0 && (
                        <div className="text-[10px] text-ink-400 mt-2">공통 표준: <span className="font-mono">{c.shared_standards.join(", ")}</span></div>
                      )}
                      {c.spec_tags && c.spec_tags.length > 0 && (
                        <div className="text-[10px] text-ink-400 mt-1">사양: <span className="font-mono">{c.spec_tags.join(" · ")}</span></div>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          )}
          {!result && !loading && !error && (
            <div className="flex-1 flex items-center justify-center text-sm text-ink-500 italic px-6 text-center">
              <div><Cpu className="w-12 h-12 text-ink-600 mx-auto mb-3" />좌측에서 원본 부품을 선택하세요.</div>
            </div>
          )}
        </section>

        {/* ═══ Right: graph ═══ */}
        <aside className="border-l border-ink-700 bg-ink-900 p-3 min-h-[400px] xl:min-h-0">
          {result ? <CytoscapeView graph={result.subgraph} wowNodeIds={[result.original.id]} /> : (
            <div className="h-full flex items-center justify-center text-xs text-ink-500 italic">그래프</div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good"|"warn" }) {
  const cls = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-ink-100";
  return (
    <div className="p-3 rounded border border-ink-700 bg-ink-800">
      <div className="text-[10px] text-ink-400">{label}</div>
      <div className={`text-sm font-mono font-bold ${cls}`}>{value}</div>
    </div>
  );
}
