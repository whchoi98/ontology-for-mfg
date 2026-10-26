"use client";
import { useState } from "react";
import { CheckCircle, HelpCircle, XCircle } from "lucide-react";
import { api } from "@/lib/api-client";
import { useActivePersona } from "@/lib/persona-context";
import type { Persona } from "@/lib/types";
import { ScenarioHeader } from "@/components/ScenarioHeader";

// Engine violations carry {regulation, substance, severity, message?};
// `rule` / `detail` are the older generic shape (still allowed by the schema).
interface Violation {
  rule?: string; detail?: string;
  regulation?: string; substance?: string; severity?: string; message?: string;
}
type ComplianceStatus = "compliant" | "non_compliant" | "insufficient_data" | "invalid_input";
interface ComplianceResult {
  status: ComplianceStatus;
  violations: Violation[];
  message?: string;
  component?: { id?: string; name?: string };
  synthetic: boolean;
}
interface ComplianceResponse {
  status?: ComplianceStatus;
  compliant?: boolean | null;
  violations?: Violation[];
  message?: string;
  component?: { id?: string; name?: string };
  _synthetic?: boolean;
}

const INSUFFICIENT_DATA_MSG =
  "부품의 물질(CAS) 선언 데이터가 없어 REACH-SVHC / RoHS 적합 여부를 판정할 수 없습니다 (데이터 없음 ≠ 적합).";

/** `compliant: null` means "no substance declaration" — never a pass. Older
 *  responses without `status` are mapped from the boolean. */
function toResult(r: ComplianceResponse): ComplianceResult {
  const status: ComplianceStatus = r.status
    ?? (r.compliant === true ? "compliant" : r.compliant === false ? "non_compliant" : "insufficient_data");
  return {
    status,
    violations: r.violations ?? [],
    message: r.message,
    component: r.component,
    synthetic: Boolean(r._synthetic),
  };
}

function violationTitle(v: Violation): string {
  return v.rule ?? ([v.regulation, v.substance].filter(Boolean).join(" · ") || "위반");
}

const VERDICT: Record<ComplianceStatus, { label: string; tone: string; icon: React.ReactNode }> = {
  compliant: {
    label: "적합 (Compliant)",
    tone: "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300",
    icon: <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />,
  },
  non_compliant: {
    label: "부적합 (Non-Compliant)",
    tone: "bg-red-500/10 border border-red-500/30 text-red-300",
    icon: <XCircle className="w-6 h-6 text-red-400 shrink-0" />,
  },
  insufficient_data: {
    label: "판정 불가 — 데이터 부족 (Insufficient Data)",
    tone: "bg-amber-500/10 border border-amber-500/30 text-amber-300",
    icon: <HelpCircle className="w-6 h-6 text-amber-400 shrink-0" />,
  },
  invalid_input: {
    label: "검사 불가 (Invalid Input)",
    tone: "bg-ink-800 border border-ink-600 text-ink-200",
    icon: <HelpCircle className="w-6 h-6 text-ink-400 shrink-0" />,
  },
};
type Sample = { label: string; persona: Persona; value: string; };

const COMPLIANCE_SAMPLES: Sample[] = [
  { label: "AMZN-CMP-IC-00001 RoHS+REACH 검증", persona: "quality",   value: "AMZN-CMP-IC-00001" },
  { label: "Lead 함유 부품 식별 (CAS 7439-92-1)", persona: "quality",   value: "COMP-MCU-001" },
  { label: "AEC-Q100 Grade 2 미달 부품",          persona: "engineer",  value: "COMP-SEN-001" },
  { label: "SVHC 244개 매핑 자동 검증",           persona: "quality",   value: "COMP-CAP-001" },
];

const PERSONA_TONE: Record<Persona, string> = {
  buyer:    "border-blue-500/40    bg-blue-500/10    text-blue-200",
  engineer: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  quality:  "border-amber-500/40   bg-amber-500/10   text-amber-200",
  scm:      "border-rose-500/40    bg-rose-500/10    text-rose-200",
  plant:    "border-violet-500/40  bg-violet-500/10  text-violet-200",
};

const PERSONA_LABEL: Record<Persona, string> = {
  buyer:    "Buyer 구매",
  engineer: "Engineer R&D",
  quality:  "Quality 품질",
  scm:      "SCM 공급망",
  plant:    "Plant 생산",
};

export default function CompliancePage() {
  const { active, setActive } = useActivePersona();
  const [componentId, setComponentId] = useState("");
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string) {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setResult(toResult((await api.compliance(id)) as ComplianceResponse));
    } catch (e) {
      setError(`규제 검사 실패 — ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(componentId);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="E" title="규제 준수 검사" tech="Cypher 부품 조회 → REACH-SVHC + RoHS 6+4 + AEC-Q100/200 결정론적 검증 엔진" />
      <div className="flex-1 mx-auto w-full max-w-4xl px-6 py-6">
        <h1 className="text-2xl font-bold text-ink-50 mb-1">규제 준수 검사</h1>
        <p className="text-sm text-ink-400 mb-4">REACH SVHC / RoHS / PFAS / AEC-Q 준수 여부 즉시 확인</p>

        {result === null && !loading && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
              추천 질문 — 클릭하면 바로 전송됩니다
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COMPLIANCE_SAMPLES.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={loading}
                  onClick={() => { setActive(p.persona); setComponentId(p.value); run(p.value); }}
                  className="group flex items-start gap-2 text-left px-3 py-2.5 rounded-lg border border-ink-700 bg-ink-900 hover:border-accent-500/60 hover:bg-ink-800 transition disabled:opacity-50"
                >
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm border shrink-0 mt-0.5 ${PERSONA_TONE[p.persona]}`}>
                    {PERSONA_LABEL[p.persona]}
                  </span>
                  <span className="text-sm text-ink-200 leading-relaxed group-hover:text-accent-200">
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={submit} className="flex gap-2 mb-6">
          <input
            className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2.5 text-sm text-ink-100 outline-hidden focus:border-accent-500 placeholder:text-ink-500"
            placeholder="예: AMZN-CMP-IC-00001"
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

        {error && <div role="alert" className="mb-4 p-3 rounded-md bg-red-500/10 text-red-300 border border-red-500/30 text-sm">{error}</div>}

        {result && (
          <div data-status={result.status} className={`px-5 py-4 rounded-xl mb-6 ${VERDICT[result.status].tone}`}>
            <div className="flex items-center gap-3 text-lg font-bold">
              {VERDICT[result.status].icon}
              {VERDICT[result.status].label}
            </div>
            {result.component?.id && (
              <div className="mt-1 ml-9 text-xs font-mono text-ink-400">
                {result.component.name ? `${result.component.name} · ` : ""}{result.component.id}
                {result.synthetic ? " (demo)" : ""}
              </div>
            )}
            {result.status === "insufficient_data" && (
              <p className="mt-2 ml-9 text-sm font-normal text-amber-200/90 leading-relaxed">
                {result.message ?? INSUFFICIENT_DATA_MSG}
              </p>
            )}
          </div>
        )}

        {result && result.violations.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-ink-100 mb-3">위반 사항 ({result.violations.length}건)</h2>
            <ul className="space-y-2">
              {result.violations.map((v, i) => (
                <li key={i} className="bg-red-500/5 border border-red-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-red-300 text-sm">{violationTitle(v)}</span>
                    {v.severity && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm border border-red-500/40 text-red-300">
                        {v.severity}
                      </span>
                    )}
                  </div>
                  {(v.detail ?? v.message) && <div className="text-ink-300 text-xs mt-1">{v.detail ?? v.message}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
