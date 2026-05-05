"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";

interface PriceRow {
  supplier_id: string;
  supplier_name?: string;
  unit_price?: number;
  currency?: string;
  lead_time_days?: number;
  otd_rate?: number;
}

export default function BuyerPricePage() {
  const [componentId, setComponentId] = useState("");
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = (await api.price(componentId)) as { rows?: PriceRow[] };
    setRows(r.rows ?? []);
    setLoading(false);
  }

  return (
    <div>
      <h1 className="font-bold text-xl mb-3">가격 비교 (Buyer)</h1>
      <form onSubmit={submit} className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="예: COMP-MCU-001"
          value={componentId}
          onChange={(e) => setComponentId(e.target.value)}
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          {loading ? "..." : "조회"}
        </button>
      </form>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse bg-white rounded border">
            <thead className="bg-neutral-100">
              <tr>
                <th className="border px-3 py-2 text-left">공급업체</th>
                <th className="border px-3 py-2 text-right">단가</th>
                <th className="border px-3 py-2 text-right">납기(일)</th>
                <th className="border px-3 py-2 text-right">OTD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-neutral-50">
                  <td className="border px-3 py-2">{r.supplier_name ?? r.supplier_id}</td>
                  <td className="border px-3 py-2 text-right">
                    {r.unit_price != null
                      ? `${r.unit_price.toLocaleString()} ${r.currency ?? "USD"}`
                      : "-"}
                  </td>
                  <td className="border px-3 py-2 text-right">{r.lead_time_days ?? "-"}</td>
                  <td className="border px-3 py-2 text-right">
                    {r.otd_rate != null ? `${(r.otd_rate * 100).toFixed(1)}%` : "-"}
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
