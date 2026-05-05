"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { KpiStrip } from "@/components/KpiStrip";

interface EsgResult {
  scope1?: number;
  scope2?: number;
  scope3?: number;
  cbam_fee?: number;
  unit?: string;
}

export default function QualityEsgPage() {
  const [plantId, setPlantId] = useState("");
  const [result, setResult] = useState<EsgResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = (await api.esg(plantId || undefined)) as EsgResult;
    setResult(r);
    setLoading(false);
  }

  const kpis = result
    ? [
        {
          label: "Scope 1 (직접 배출)",
          value: `${result.scope1?.toLocaleString() ?? "-"} ${result.unit ?? "tCO₂"}`,
        },
        {
          label: "Scope 2 (간접 전력)",
          value: `${result.scope2?.toLocaleString() ?? "-"} ${result.unit ?? "tCO₂"}`,
        },
        {
          label: "Scope 3 (공급망)",
          value: `${result.scope3?.toLocaleString() ?? "-"} ${result.unit ?? "tCO₂"}`,
        },
        {
          label: "CBAM 부담금",
          value: `€${result.cbam_fee?.toLocaleString() ?? "-"}`,
          delta: "EU CBAM 2026",
        },
      ]
    : [];

  return (
    <div>
      <h1 className="font-bold text-xl mb-3">탄소 배출 / ESG (Quality)</h1>
      <form onSubmit={submit} className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="Plant ID (비워두면 전체)"
          value={plantId}
          onChange={(e) => setPlantId(e.target.value)}
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          {loading ? "..." : "조회"}
        </button>
      </form>
      {kpis.length > 0 && <KpiStrip kpis={kpis} />}
    </div>
  );
}
