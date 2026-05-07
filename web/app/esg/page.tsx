"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { KpiStrip } from "@/components/KpiStrip";
import { useActivePersona } from "@/lib/persona-context";
import { ScenarioHeader } from "@/components/ScenarioHeader";

interface EsgResult { scope1?: number; scope2?: number; scope3?: number; cbam_fee?: number; unit?: string; }

export default function EsgPage() {
  const { active } = useActivePersona();
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

  const kpis = result ? [
    { label: "Scope 1 (직접 배출)", value: `${result.scope1?.toLocaleString() ?? "-"} ${result.unit ?? "tCO₂"}` },
    { label: "Scope 2 (간접 전력)", value: `${result.scope2?.toLocaleString() ?? "-"} ${result.unit ?? "tCO₂"}` },
    { label: "Scope 3 (공급망)", value: `${result.scope3?.toLocaleString() ?? "-"} ${result.unit ?? "tCO₂"}` },
    { label: "CBAM 부담금", value: `€${result.cbam_fee?.toLocaleString() ?? "-"}`, delta: "EU CBAM 2026" },
  ] : [];

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="K" title="ESG / CBAM" tech="Cypher Plant·CarbonScope → Scope 1/2/3 합산 + CBAM 환산 (K-ETS 매핑)" />
      <div className="flex-1 mx-auto w-full max-w-4xl px-6 py-6">
        <h1 className="text-2xl font-bold text-ink-50 mb-1">탄소 배출 / ESG</h1>
        <p className="text-sm text-ink-400 mb-4">Scope 1/2/3 배출량 + EU CBAM 2026 부담금 + IRA 적격 여부</p>
        <form onSubmit={submit} className="flex gap-2 mb-6">
          <select
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-accent-500"
            value={plantId}
            onChange={(e) => setPlantId(e.target.value)}
          >
            <option value="">전체 공장</option>
            <option value="PLANT-KR-01">PLANT-KR-01 (구미)</option>
            <option value="PLANT-KR-02">PLANT-KR-02 (평택)</option>
            <option value="PLANT-VN-01">PLANT-VN-01 (하노이)</option>
            <option value="PLANT-MX-01">PLANT-MX-01 (몬테레이)</option>
          </select>
          <button
            type="submit"
            className="bg-accent-500 hover:bg-accent-400 text-ink-950 font-semibold px-4 py-2 rounded-md text-sm transition"
          >
            {loading ? "조회 중..." : "조회"}
          </button>
        </form>
        {kpis.length > 0 && <KpiStrip kpis={kpis} />}
      </div>
    </div>
  );
}
