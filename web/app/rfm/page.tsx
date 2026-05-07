"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { KpiStrip } from "@/components/KpiStrip";
import { useActivePersona } from "@/lib/persona-context";
import { ScenarioHeader } from "@/components/ScenarioHeader";

interface RfmRow {
  supplier_id: string; supplier_name?: string; rfm_score?: number;
  recency?: number; frequency?: number; monetary?: number;
}

export default function RfmPage() {
  const { active } = useActivePersona();
  const [tier, setTier] = useState(1);
  const [rows, setRows] = useState<RfmRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // API returns { tier, ranked: [...] } — ranked rows use composite/recency/frequency/monetary
    const r = (await api.rfm(tier)) as { rows?: RfmRow[]; ranked?: RfmRow[] };
    const raw = r.ranked ?? r.rows ?? [];
    // Map API field names: composite → rfm_score (if needed)
    const mapped = raw.map((row) => {
      const anyRow = row as unknown as Record<string, unknown>;
      return {
        supplier_id:   String(anyRow.id ?? anyRow.supplier_id ?? ""),
        supplier_name: String(anyRow.name ?? anyRow.supplier_name ?? ""),
        rfm_score:     typeof anyRow.composite  === "number" ? anyRow.composite  :
                       typeof anyRow.rfm_score  === "number" ? anyRow.rfm_score  : undefined,
        recency:       typeof anyRow.recency    === "number" ? anyRow.recency    : undefined,
        frequency:     typeof anyRow.frequency  === "number" ? anyRow.frequency  : undefined,
        monetary:      typeof anyRow.monetary   === "number" ? anyRow.monetary   : undefined,
      } as RfmRow;
    });
    setRows(mapped);
    setLoading(false);
  }

  const topRow = rows[0];
  const kpis = topRow ? [
    { label: "Top 공급업체", value: topRow.supplier_name ?? topRow.supplier_id },
    { label: "종합 점수", value: topRow.rfm_score != null ? topRow.rfm_score.toFixed(3) : "-" },
    { label: "신뢰도(OTD)", value: topRow.recency != null ? topRow.recency.toFixed(3) : "-" },
    { label: "일관성", value: topRow.frequency != null ? topRow.frequency.toFixed(3) : "-" },
    { label: "응답성", value: topRow.monetary != null ? topRow.monetary.toFixed(3) : "-" },
  ] : [];

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="I" title="협력사 RFM" tech="Cypher Supplier RFM 정규화 → 합성 점수 (R×F×M geometric mean) + 점수 색상 분류" />
      <div className="flex-1 mx-auto w-full max-w-4xl px-6 py-6">
        <h1 className="text-2xl font-bold text-ink-50 mb-1">협력사 RFM 분석</h1>
        <p className="text-sm text-ink-400 mb-4">Recency·Frequency·Monetary 기반 협력사 등급 분석</p>
        <form onSubmit={submit} className="flex gap-2 mb-6">
          <select
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-accent-500"
            value={tier}
            onChange={(e) => setTier(Number(e.target.value))}
          >
            <option value={1}>Tier 1</option>
            <option value={2}>Tier 2</option>
            <option value={3}>Tier 3</option>
          </select>
          <button
            type="submit"
            className="bg-accent-500 hover:bg-accent-400 text-ink-950 font-semibold px-4 py-2 rounded-md text-sm transition"
          >
            {loading ? "분석 중..." : "분석"}
          </button>
        </form>
        {kpis.length > 0 && <div className="mb-6"><KpiStrip kpis={kpis} /></div>}
        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-900">
            <table className="w-full text-sm bg-ink-900">
              <thead className="bg-ink-800">
                <tr>
                  {["순위","공급업체","RFM","R (신뢰도)","F (일관성)","M (응답성)"].map((h) => (
                    <th key={h} className="border-b border-ink-700 px-4 py-3 text-left text-xs text-ink-300 font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-ink-900">
                {rows.map((r, i) => {
                  const score = r.rfm_score ?? 0;
                  const scoreColor = score >= 0.85 ? "text-emerald-300"
                    : score >= 0.70 ? "text-amber-300"
                    : "text-rose-300";
                  return (
                    <tr key={i} className="border-b border-ink-800 hover:bg-ink-800/60 transition">
                      <td className="px-4 py-3 text-center text-ink-400 font-mono">{i + 1}</td>
                      <td className="px-4 py-3 text-ink-100 font-medium">{r.supplier_name ?? r.supplier_id}</td>
                      <td className={`px-4 py-3 font-mono font-bold ${scoreColor}`}>{r.rfm_score?.toFixed(3) ?? "-"}</td>
                      <td className="px-4 py-3 text-ink-300 font-mono">{r.recency?.toFixed(3) ?? "-"}</td>
                      <td className="px-4 py-3 text-ink-300 font-mono">{r.frequency?.toFixed(3) ?? "-"}</td>
                      <td className="px-4 py-3 text-ink-300 font-mono">{r.monetary?.toFixed(3) ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
