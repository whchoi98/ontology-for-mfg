"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { KpiStrip } from "@/components/KpiStrip";
import { useActivePersona } from "@/lib/persona-context";

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
    const r = (await api.rfm(tier)) as { rows?: RfmRow[] };
    setRows(r.rows ?? []);
    setLoading(false);
  }

  const topRow = rows[0];
  const kpis = topRow ? [
    { label: "Top 공급업체", value: topRow.supplier_name ?? topRow.supplier_id },
    { label: "RFM 점수", value: topRow.rfm_score?.toFixed(2) ?? "-" },
    { label: "Recency", value: topRow.recency?.toString() ?? "-" },
    { label: "Frequency", value: topRow.frequency?.toString() ?? "-" },
    { label: "Monetary", value: topRow.monetary?.toLocaleString() ?? "-" },
  ] : [];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">시나리오 I · 협력사 RFM</div>
        <div className="ml-auto text-xs text-ink-500">페르소나: <span className="text-ink-200 font-medium">{active}</span></div>
      </header>
      <div className="flex-1 p-6 max-w-4xl">
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
          <div className="overflow-x-auto rounded-lg border border-ink-700">
            <table className="w-full text-sm">
              <thead className="bg-ink-800">
                <tr>
                  {["순위","공급업체","RFM","R","F","M"].map((h) => (
                    <th key={h} className="border-b border-ink-700 px-4 py-3 text-left text-xs text-ink-300 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-ink-700/40 hover:bg-ink-800/50">
                    <td className="px-4 py-3 text-center text-ink-400 font-mono">{i + 1}</td>
                    <td className="px-4 py-3 text-ink-100">{r.supplier_name ?? r.supplier_id}</td>
                    <td className="px-4 py-3 text-ink-200 font-mono font-medium">{r.rfm_score?.toFixed(2) ?? "-"}</td>
                    <td className="px-4 py-3 text-ink-300 font-mono">{r.recency ?? "-"}</td>
                    <td className="px-4 py-3 text-ink-300 font-mono">{r.frequency ?? "-"}</td>
                    <td className="px-4 py-3 text-ink-300 font-mono">{r.monetary?.toLocaleString() ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
