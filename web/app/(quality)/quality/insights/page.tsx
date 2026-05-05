"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { KpiStrip } from "@/components/KpiStrip";

interface KpiRow {
  label: string;
  value: string;
  delta?: string;
}

export default function QualityInsightsPage() {
  const [question, setQuestion] = useState("");
  const [summary, setSummary] = useState("");
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = (await api.insights(question, "quality")) as {
      summary?: string;
      rows?: KpiRow[];
    };
    setSummary(r.summary ?? "");
    setKpis(r.rows ?? []);
    setLoading(false);
  }

  return (
    <div>
      <h1 className="font-bold text-xl mb-3">품질 인사이트 (Quality)</h1>
      <form onSubmit={submit} className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="예: 이번 분기 불량률 상위 5개 부품은?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          {loading ? "..." : "조회"}
        </button>
      </form>
      {summary && (
        <div className="bg-white border rounded p-4 mb-4 text-sm text-neutral-700">
          {summary}
        </div>
      )}
      {kpis.length > 0 && <KpiStrip kpis={kpis} />}
    </div>
  );
}
