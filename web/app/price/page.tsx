"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Wallet, Sparkles, Tag, Layers, Search as SearchIcon, Cpu, Truck, Award, MapPin } from "lucide-react";

import { api } from "@/lib/api-client";
import { ScenarioHeader } from "@/components/ScenarioHeader";
import { useActivePersona } from "@/lib/persona-context";
import type { Persona } from "@/lib/types";

const CytoscapeView = dynamic(
  () => import("@/components/CytoscapeView").then((m) => m.CytoscapeView),
  { ssr: false },
);

interface SampleComponent { id: string; name: string; category: string; leadtime_days?: number; unit_price_usd?: number }

interface Offer {
  supplier_id: string; supplier_name: string; region: string;
  leadtime_days: number; otd: number;
  unit_price_usd: number; price_delta_pct: number;
  moq: number; stock_units: number; stock_status: string;
  defect_ppm: number; tier: number;
  composite_score: number;
}

interface PriceResponse {
  original: { id: string; name: string; category: string;
              current_supplier: string | null; current_unit_price_usd: number | null;
              monthly_demand_units: number };
  offers: Offer[];
  subgraph: { nodes: Array<{ data: { id: string; label?: string; [k: string]: unknown } }>;
              edges: Array<{ data: { id: string; source: string; target: string; type?: string } }> };
  summary: { supplier_count: number; min_leadtime_days: number; max_leadtime_days: number;
              min_unit_price_usd: number; max_unit_price_usd: number; avg_otd: number;
              best_supplier_id: string | null; best_supplier_name: string | null };
  _summary?: string;
}

type Sample = { label: string; persona: Persona; cid: string };
const SAMPLES: Sample[] = [
  { label: "AMZN-CMP-IC-00001 4 협력사 단가/재고",         persona: "buyer", cid: "AMZN-CMP-IC-00001" },
  { label: "AMZN-CMP-PCB-00002 MX vs CN 비교",            persona: "buyer", cid: "AMZN-CMP-PCB-00002" },
  { label: "AMZN-CMP-DIS-00003 OTD 95% 이상 추천",         persona: "scm",   cid: "AMZN-CMP-DIS-00003" },
  { label: "AMZN-CMP-MOT-00004 긴급 조달 (lead time ≤7d)", persona: "buyer", cid: "AMZN-CMP-MOT-00004" },
];
const PERSONA_TONE: Record<Persona, string> = {
  buyer:    "border-blue-500/40    bg-blue-500/10    text-blue-200",
  engineer: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  quality:  "border-amber-500/40   bg-amber-500/10   text-amber-200",
  scm:      "border-rose-500/40    bg-rose-500/10    text-rose-200",
  plant:    "border-violet-500/40  bg-violet-500/10  text-violet-200",
};
const PERSONA_LABEL: Record<Persona, string> = { buyer:"Buyer 구매", engineer:"Engineer R&D", quality:"Quality 품질", scm:"SCM 공급망", plant:"Plant 생산" };

const STOCK_TONE: Record<string, string> = {
  "충분":     "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  "부족":     "bg-amber-500/10   text-amber-300   border-amber-500/30",
  "주문생산": "bg-violet-500/10  text-violet-300  border-violet-500/30",
  "긴급재고": "bg-rose-500/10    text-rose-300    border-rose-500/30",
};

export default function PricePage() {
  const { setActive } = useActivePersona();
  const [samples, setSamples] = useState<SampleComponent[] | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<PriceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.priceSamples(15)
      .then((r) => setSamples((r as { items: SampleComponent[] }).items))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true); setError(null); setResult(null);
    (api.price(selected) as Promise<PriceResponse>)
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  const filteredSamples = (samples ?? []).filter((p) => {
    if (!filter.trim()) return true;
    const f = filter.trim().toLowerCase();
    return p.name.toLowerCase().includes(f) || p.id.toLowerCase().includes(f);
  });

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="G" title="단가/재고 비교"
        tech="Cypher SUPPLIED_BY → 협력사별 단가/재고/리드타임 매트릭스 + 종합 점수 (price·leadtime·OTD)" />

      <div className="flex-1 grid xl:grid-cols-[340px_1fr_360px] min-h-0">
        {/* ═══ Left Picker ═══ */}
        <aside className="border-r border-ink-700 bg-ink-900 flex flex-col min-h-0">
          <div className="p-4 border-b border-ink-700">
            <h2 className="text-sm font-semibold text-ink-100 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-sky-400" /> 부품 선택
            </h2>
            <p className="text-[10px] text-ink-400 mt-1 leading-relaxed">
              부품 클릭 → 협력사 단가·재고·리드타임·OTD를 매트릭스로 비교 + 종합 점수 추천.
            </p>
          </div>
          {!selected && (
            <div className="p-3 border-b border-ink-700 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">추천</div>
              {SAMPLES.map((s, i) => (
                <button key={i} onClick={() => { setActive(s.persona); setSelected(s.cid); }}
                  className="w-full text-left px-2 py-1.5 rounded border border-ink-700 bg-ink-800 hover:border-sky-500/60 transition flex items-center gap-2">
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${PERSONA_TONE[s.persona]}`}>{PERSONA_LABEL[s.persona]}</span>
                  <span className="text-[11px] text-ink-200 truncate">{s.label}</span>
                </button>
              ))}
            </div>
          )}
          <div className="px-3 py-2 border-b border-ink-700 relative">
            <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-500" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="부품 필터"
              className="w-full rounded bg-ink-800 border border-ink-700 text-xs pl-8 pr-3 py-1.5 text-ink-100 outline-none focus:border-sky-500 placeholder:text-ink-500" />
          </div>
          <ul className="flex-1 overflow-y-auto">
            {!samples && <li className="text-xs text-ink-500 italic p-4">로딩 중…</li>}
            {filteredSamples.map((p) => {
              const active = p.id === selected;
              return (
                <li key={p.id}>
                  <button onClick={() => setSelected(p.id)}
                    className={["w-full text-left px-4 py-2.5 border-b border-ink-700/40 transition",
                      active ? "bg-sky-500/10 border-l-2 border-l-sky-500" : "hover:bg-ink-800"].join(" ")}>
                    <div className={`text-sm font-medium truncate ${active ? "text-sky-200" : "text-ink-100"}`}>{p.name}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ink-400 font-mono">
                      <span>{p.id}</span><span>·</span><span>{p.category}</span>
                      {p.unit_price_usd != null && <><span>·</span><span>${p.unit_price_usd.toFixed(2)}</span></>}
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
              <Wallet className="w-6 h-6 text-sky-400" /> 단가 / 재고 비교
            </h1>
            <p className="text-sm text-ink-400">협력사별 단가·재고·lead time·OTD 매트릭스. 종합 점수가 가장 높은 협력사를 추천합니다.</p>
          </div>
          {error && <div className="mx-6 mb-4 p-3 rounded-md bg-red-500/10 text-red-300 border border-red-500/30 text-sm">{error}</div>}
          {loading && <div className="mx-6 text-sm text-ink-400">분석 중…</div>}
          {result && (
            <div className="px-6 pb-6 space-y-5">
              <article className="p-5 rounded-lg border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-sky-500/0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wider text-sky-300 font-semibold mb-1">Component</div>
                    <h2 className="text-lg font-bold text-ink-50 truncate">{result.original.name}</h2>
                    <div className="flex flex-wrap gap-2 text-[10px] font-mono text-ink-300 mt-2">
                      <span>{result.original.id}</span>
                      <span><Layers className="inline w-3 h-3 mr-1" />{result.original.category}</span>
                      <span>월 수요 {result.original.monthly_demand_units.toLocaleString()}개</span>
                      {result.original.current_supplier && (
                        <span><Tag className="inline w-3 h-3 mr-1" />현재: {result.original.current_supplier}</span>
                      )}
                    </div>
                  </div>
                  {result.summary.best_supplier_name && (
                    <div className="shrink-0 px-3 py-2 rounded border border-emerald-500/40 bg-emerald-500/10">
                      <div className="text-[9px] uppercase tracking-wider text-emerald-300 font-semibold">추천</div>
                      <div className="text-sm font-bold text-emerald-200">{result.summary.best_supplier_name}</div>
                    </div>
                  )}
                </div>
              </article>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="협력사 수"   value={`${result.summary.supplier_count}`} />
                <Stat label="단가 범위 (USD)" value={`$${result.summary.min_unit_price_usd.toFixed(2)} – $${result.summary.max_unit_price_usd.toFixed(2)}`} />
                <Stat label="리드타임 범위" value={`${result.summary.min_leadtime_days} – ${result.summary.max_leadtime_days}일`} />
                <Stat label="평균 OTD" value={`${(result.summary.avg_otd * 100).toFixed(1)}%`} tone="good" />
              </div>

              <article>
                <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-sky-400" /> 협력사 매트릭스 ({result.offers.length})
                </h3>
                <div className="overflow-x-auto rounded-lg border border-ink-700">
                  <table className="w-full text-sm bg-ink-900">
                    <thead className="bg-ink-800">
                      <tr>
                        {["협력사", "지역", "단가", "Δ%", "MOQ", "재고", "Lead", "OTD", "결함 ppm", "점수"].map((h) => (
                          <th key={h} className="border-b border-ink-700 px-3 py-2 text-left text-[10px] text-ink-300 font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-ink-900">
                      {result.offers.map((o, i) => {
                        const isBest = o.supplier_id === result.summary.best_supplier_id;
                        return (
                          <tr key={i} className={`border-b border-ink-800 transition ${isBest ? "bg-emerald-500/10 hover:bg-emerald-500/15" : "hover:bg-ink-800/60"}`}>
                            <td className="px-3 py-2.5 text-ink-100 whitespace-nowrap">
                              <div className="font-medium flex items-center gap-1.5">
                                {o.supplier_name}
                                {isBest && <Award className="w-3.5 h-3.5 text-emerald-400" />}
                              </div>
                              <div className="text-[10px] font-mono text-ink-500">{o.supplier_id}</div>
                            </td>
                            <td className="px-3 py-2.5 text-ink-300 font-mono whitespace-nowrap">
                              <MapPin className="inline w-3 h-3 mr-1 text-ink-500" />{o.region}
                            </td>
                            <td className="px-3 py-2.5 text-ink-100 font-mono whitespace-nowrap">${o.unit_price_usd.toFixed(2)}</td>
                            <td className={`px-3 py-2.5 font-mono whitespace-nowrap ${o.price_delta_pct < 0 ? "text-emerald-300" : o.price_delta_pct > 0 ? "text-amber-300" : "text-ink-400"}`}>
                              {o.price_delta_pct > 0 ? "+" : ""}{o.price_delta_pct}%
                            </td>
                            <td className="px-3 py-2.5 text-ink-300 font-mono whitespace-nowrap">{o.moq.toLocaleString()}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="text-ink-200 font-mono text-xs">{o.stock_units.toLocaleString()}</div>
                              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${STOCK_TONE[o.stock_status] ?? "bg-ink-700 text-ink-300 border-ink-600"}`}>
                                {o.stock_status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-ink-100 font-mono whitespace-nowrap"><Truck className="inline w-3 h-3 mr-1 text-ink-500" />{o.leadtime_days}일</td>
                            <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                              <span className={o.otd >= 0.95 ? "text-emerald-300" : o.otd >= 0.90 ? "text-amber-300" : "text-rose-300"}>
                                {(o.otd * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                              <span className={o.defect_ppm <= 100 ? "text-emerald-300" : o.defect_ppm <= 300 ? "text-amber-300" : "text-rose-300"}>
                                {o.defect_ppm}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-mono font-bold whitespace-nowrap">
                              <span className={o.composite_score >= 70 ? "text-emerald-300" : o.composite_score >= 50 ? "text-amber-300" : "text-rose-300"}>
                                {o.composite_score}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          )}
          {!result && !loading && !error && (
            <div className="flex-1 flex items-center justify-center text-sm text-ink-500 italic px-6 text-center">
              <div><Cpu className="w-12 h-12 text-ink-600 mx-auto mb-3" />좌측에서 부품을 선택하세요.</div>
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
