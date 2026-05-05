"use client";
import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api-client";

interface ValidationCheck {
  label: string;
  expected: string;
  actual?: string | number;
  status: "pass" | "fail" | "unknown";
  note?: string;
}

// Spec § 8.4 target counts
const SPEC_CHECKS: Omit<ValidationCheck, "actual" | "status">[] = [
  { label: "Component 노드 수", expected: "≥ 2000", note: "합성 부품 데이터" },
  { label: "Supplier 노드 수", expected: "≥ 150", note: "1차 협력사" },
  { label: "TradeLane 노드 수", expected: "≥ 40", note: "글로벌 운송 lane" },
  { label: "Substance (SVHC)", expected: "≥ 240", note: "REACH 화학물질 목록" },
  { label: "QualityIncident 수", expected: "≥ 80", note: "품질 인시던트" },
  { label: "Telemetry 데이터포인트", expected: "≥ 5000", note: "IoT 센서 기록" },
  { label: "/api/healthz", expected: "200 OK", note: "API 상태 확인" },
  { label: "/api/lane 엔드포인트", expected: "lanes 배열 반환", note: "SCM Lane API" },
];

export default function ValidationPage() {
  const [checks, setChecks] = useState<ValidationCheck[]>(
    SPEC_CHECKS.map((c) => ({ ...c, status: "unknown" as const }))
  );
  const [running, setRunning] = useState(false);

  async function runChecks() {
    setRunning(true);
    const results: ValidationCheck[] = [];

    // Check lane API
    try {
      const r = await api.lanes() as { lanes?: unknown[] } | unknown[];
      const laneArr = Array.isArray(r) ? r : (r as { lanes?: unknown[] }).lanes ?? [];
      results.push({ label: "/api/lane 엔드포인트", expected: "lanes 배열 반환", actual: `${laneArr.length}개 lanes`, status: laneArr.length > 0 ? "pass" : "fail" });
    } catch {
      results.push({ label: "/api/lane 엔드포인트", expected: "lanes 배열 반환", actual: "오류", status: "fail" });
    }

    // Check healthz via search
    try {
      const r = await fetch("/api/healthz");
      results.push({ label: "/api/healthz", expected: "200 OK", actual: `${r.status}`, status: r.ok ? "pass" : "fail" });
    } catch {
      results.push({ label: "/api/healthz", expected: "200 OK", actual: "연결 실패", status: "fail" });
    }

    // Static spec checks (we can't query Neptune counts without a dedicated endpoint)
    const staticPass = [
      { label: "Component 노드 수", note: "합성 부품 데이터" },
      { label: "Supplier 노드 수", note: "1차 협력사" },
      { label: "TradeLane 노드 수", note: "글로벌 운송 lane" },
      { label: "Substance (SVHC)", note: "REACH 화학물질 목록" },
      { label: "QualityIncident 수", note: "품질 인시던트" },
      { label: "Telemetry 데이터포인트", note: "IoT 센서 기록" },
    ];

    for (const check of SPEC_CHECKS) {
      if (results.find((r) => r.label === check.label)) continue;
      results.push({ ...check, actual: "Neptune 직접 쿼리 필요", status: "unknown" });
    }

    setChecks(results.sort((a, b) => SPEC_CHECKS.findIndex(s => s.label === a.label) - SPEC_CHECKS.findIndex(s => s.label === b.label)));
    setRunning(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">메타 · 검증 리포트</div>
      </header>
      <div className="flex-1 p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink-50 mb-1">검증 리포트</h1>
            <p className="text-sm text-ink-400">스펙 § 8.4 노드 수·API 상태 검증</p>
          </div>
          <button
            onClick={runChecks}
            disabled={running}
            className="flex items-center gap-2 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-4 py-2 rounded-md text-sm transition"
          >
            <RefreshCw className={`w-4 h-4 ${running ? "animate-spin" : ""}`} />
            {running ? "실행 중..." : "검증 실행"}
          </button>
        </div>

        <div className="space-y-2">
          {checks.map((c) => (
            <div key={c.label} className="flex items-start gap-3 bg-ink-800 border border-ink-700 rounded-lg p-4">
              {c.status === "pass" && <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
              {c.status === "fail" && <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
              {c.status === "unknown" && <AlertCircle className="w-5 h-5 text-ink-500 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink-100">{c.label}</div>
                <div className="flex items-center gap-3 mt-1 text-xs">
                  <span className="text-ink-400">기대: <span className="text-ink-200">{c.expected}</span></span>
                  {c.actual && <span className="text-ink-400">실제: <span className={c.status === "pass" ? "text-emerald-300" : c.status === "fail" ? "text-red-300" : "text-ink-500"}>{c.actual}</span></span>}
                </div>
                {c.note && <div className="text-[10px] text-ink-500 mt-1">{c.note}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
