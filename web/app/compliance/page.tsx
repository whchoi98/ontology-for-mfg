"use client";
import { useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { api } from "@/lib/api-client";
import { useActivePersona } from "@/lib/persona-context";

interface Violation { rule: string; detail?: string; }

export default function CompliancePage() {
  const { active } = useActivePersona();
  const [componentId, setComponentId] = useState("");
  const [compliant, setCompliant] = useState<boolean | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = (await api.compliance(componentId)) as { compliant?: boolean; violations?: Violation[] };
    setCompliant(r.compliant ?? null);
    setViolations(r.violations ?? []);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">시나리오 E · 규제 검증</div>
        <div className="ml-auto text-xs text-ink-500">페르소나: <span className="text-ink-200 font-medium">{active}</span></div>
      </header>
      <div className="flex-1 p-6 max-w-2xl">
        <h1 className="text-2xl font-bold text-ink-50 mb-1">규제 준수 검사</h1>
        <p className="text-sm text-ink-400 mb-4">REACH SVHC / RoHS / PFAS / AEC-Q 준수 여부 즉시 확인</p>
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
            {loading ? "검사 중..." : "검사"}
          </button>
        </form>

        {compliant !== null && (
          <div className={[
            "flex items-center gap-3 px-5 py-4 rounded-xl mb-6 text-lg font-bold",
            compliant ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border border-red-500/30 text-red-300",
          ].join(" ")}>
            {compliant
              ? <CheckCircle className="w-6 h-6 text-emerald-400" />
              : <XCircle className="w-6 h-6 text-red-400" />}
            {compliant ? "적합 (Compliant)" : "부적합 (Non-Compliant)"}
          </div>
        )}

        {violations.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-ink-100 mb-3">위반 사항 ({violations.length}건)</h2>
            <ul className="space-y-2">
              {violations.map((v, i) => (
                <li key={i} className="bg-red-500/5 border border-red-500/30 rounded-lg p-3">
                  <div className="font-semibold text-red-300 text-sm">{v.rule}</div>
                  {v.detail && <div className="text-ink-300 text-xs mt-1">{v.detail}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
