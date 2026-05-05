"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useActivePersona } from "@/lib/persona-context";

interface PriceRow {
  supplier_id: string; supplier_name?: string; unit_price?: number;
  currency?: string; lead_time_days?: number; otd_rate?: number;
}

export default function PricePage() {
  const { active } = useActivePersona();
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
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">시나리오 G · 단가/재고 비교</div>
        <div className="ml-auto text-xs text-ink-500">페르소나: <span className="text-ink-200 font-medium">{active}</span></div>
      </header>
      <div className="flex-1 p-6 max-w-3xl">
        <h1 className="text-2xl font-bold text-ink-50 mb-1">단가 / 재고 비교</h1>
        <p className="text-sm text-ink-400 mb-4">복수 공급사별 단가·납기·OTD 매트릭스 비교</p>
        <form onSubmit={submit} className="flex gap-2 mb-6">
          <input
            className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500"
            placeholder="예: COMP-MCU-001"
            value={componentId}
            onChange={(e) => setComponentId(e.target.value)}
          />
          <button
            type="submit"
            className="bg-accent-500 hover:bg-accent-400 text-ink-950 font-semibold px-4 py-2 rounded-md text-sm transition"
          >
            {loading ? "조회 중..." : "조회"}
          </button>
        </form>
        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-ink-700">
            <table className="w-full text-sm">
              <thead className="bg-ink-800">
                <tr>
                  <th className="border-b border-ink-700 px-4 py-3 text-left text-xs text-ink-300 font-semibold">공급업체</th>
                  <th className="border-b border-ink-700 px-4 py-3 text-right text-xs text-ink-300 font-semibold">단가</th>
                  <th className="border-b border-ink-700 px-4 py-3 text-right text-xs text-ink-300 font-semibold">납기(일)</th>
                  <th className="border-b border-ink-700 px-4 py-3 text-right text-xs text-ink-300 font-semibold">OTD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-ink-700/40 hover:bg-ink-800/50">
                    <td className="px-4 py-3 text-ink-100">{r.supplier_name ?? r.supplier_id}</td>
                    <td className="px-4 py-3 text-right text-ink-200 font-mono">
                      {r.unit_price != null ? `${r.unit_price.toLocaleString()} ${r.currency ?? "USD"}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-200">{r.lead_time_days ?? "-"}</td>
                    <td className="px-4 py-3 text-right">
                      {r.otd_rate != null ? (
                        <span className={`font-mono ${r.otd_rate >= 0.95 ? "text-emerald-400" : r.otd_rate >= 0.85 ? "text-amber-400" : "text-red-400"}`}>
                          {(r.otd_rate * 100).toFixed(1)}%
                        </span>
                      ) : "-"}
                    </td>
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
