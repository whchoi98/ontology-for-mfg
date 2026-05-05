"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { KpiStrip } from "@/components/KpiStrip";

interface RfmRow {
  supplier_id: string;
  supplier_name?: string;
  rfm_score?: number;
  recency?: number;
  frequency?: number;
  monetary?: number;
}

export default function QualityRfmPage() {
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
  const kpis = topRow
    ? [
        { label: "Top 공급업체", value: topRow.supplier_name ?? topRow.supplier_id },
        { label: "RFM 점수", value: topRow.rfm_score?.toFixed(2) ?? "-" },
        { label: "Recency", value: topRow.recency?.toString() ?? "-" },
        { label: "Frequency", value: topRow.frequency?.toString() ?? "-" },
        { label: "Monetary", value: topRow.monetary?.toLocaleString() ?? "-" },
      ]
    : [];

  return (
    <div>
      <h1 className="font-bold text-xl mb-3">공급업체 RFM 분석 (Quality)</h1>
      <form onSubmit={submit} className="flex gap-2 mb-4">
        <select
          className="border rounded px-3 py-2"
          value={tier}
          onChange={(e) => setTier(Number(e.target.value))}
        >
          <option value={1}>Tier 1</option>
          <option value={2}>Tier 2</option>
          <option value={3}>Tier 3</option>
        </select>
        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          {loading ? "..." : "분석"}
        </button>
      </form>
      {kpis.length > 0 && <KpiStrip kpis={kpis} />}
      {rows.length > 0 && (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm border-collapse bg-white rounded border">
            <thead className="bg-neutral-100">
              <tr>
                <th className="border px-3 py-2 text-left">순위</th>
                <th className="border px-3 py-2 text-left">공급업체</th>
                <th className="border px-3 py-2 text-right">RFM</th>
                <th className="border px-3 py-2 text-right">R</th>
                <th className="border px-3 py-2 text-right">F</th>
                <th className="border px-3 py-2 text-right">M</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-neutral-50">
                  <td className="border px-3 py-2 text-center">{i + 1}</td>
                  <td className="border px-3 py-2">{r.supplier_name ?? r.supplier_id}</td>
                  <td className="border px-3 py-2 text-right font-medium">
                    {r.rfm_score?.toFixed(2) ?? "-"}
                  </td>
                  <td className="border px-3 py-2 text-right">{r.recency ?? "-"}</td>
                  <td className="border px-3 py-2 text-right">{r.frequency ?? "-"}</td>
                  <td className="border px-3 py-2 text-right">
                    {r.monetary?.toLocaleString() ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
