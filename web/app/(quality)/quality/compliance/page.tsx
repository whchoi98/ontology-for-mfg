"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";

interface Violation {
  rule: string;
  detail?: string;
}

export default function QualityCompliancePage() {
  const [componentId, setComponentId] = useState("");
  const [compliant, setCompliant] = useState<boolean | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = (await api.compliance(componentId)) as {
      compliant?: boolean;
      violations?: Violation[];
    };
    setCompliant(r.compliant ?? null);
    setViolations(r.violations ?? []);
    setLoading(false);
  }

  return (
    <div className="max-w-xl">
      <h1 className="font-bold text-xl mb-3">규제 준수 검사 (Quality)</h1>
      <form onSubmit={submit} className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="예: COMP-MCU-001"
          value={componentId}
          onChange={(e) => setComponentId(e.target.value)}
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          {loading ? "..." : "검사"}
        </button>
      </form>
      {compliant !== null && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-white font-bold text-lg mb-4 ${
            compliant ? "bg-emerald-500" : "bg-red-500"
          }`}
        >
          <span>{compliant ? "✅" : "❌"}</span>
          <span>{compliant ? "적합 (Compliant)" : "부적합 (Non-Compliant)"}</span>
        </div>
      )}
      {violations.length > 0 && (
        <div>
          <h2 className="font-semibold text-base mb-2">위반 사항</h2>
          <ul className="space-y-2">
            {violations.map((v, i) => (
              <li key={i} className="bg-red-50 border border-red-200 rounded p-2 text-sm">
                <div className="font-medium text-red-700">{v.rule}</div>
                {v.detail && <div className="text-neutral-600 mt-0.5">{v.detail}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
