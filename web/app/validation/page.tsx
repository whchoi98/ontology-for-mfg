"use client";
import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { api, opsIngest, type IngestStatus } from "@/lib/api-client";
import { ScenarioHeader } from "@/components/ScenarioHeader";

interface ValidationCheck {
  label: string;
  expected: string;
  actual?: string | number;
  status: "pass" | "fail" | "unknown";
  note?: string;
}

// Spec § 8.4 target counts → mapped to actual Neptune labels surfaced by
// `/api/ops/ingest`. Each entry encodes the Neptune label name and the
// minimum count that must be present for the check to pass.
const NODE_CHECKS: Array<{
  label: string;
  neptuneLabel: string;
  min: number;
  note: string;
}> = [
  { label: "Component 노드 수",        neptuneLabel: "Component",       min: 2000, note: "합성 부품 데이터" },
  { label: "Supplier 노드 수",         neptuneLabel: "Supplier",        min: 150,  note: "1차 협력사" },
  { label: "TradeLane 노드 수",        neptuneLabel: "TradeLane",       min: 40,   note: "글로벌 운송 lane" },
  { label: "Substance (SVHC)",         neptuneLabel: "Substance",       min: 240,  note: "REACH 화학물질 목록" },
  { label: "QualityIncident 수",       neptuneLabel: "QualityIncident", min: 80,   note: "품질 인시던트" },
  { label: "Telemetry 데이터포인트",   neptuneLabel: "Telemetry",       min: 5000, note: "IoT 센서 기록" },
];

const API_CHECKS = [
  { label: "/api/healthz",          expected: "200 OK",         note: "API 상태 확인" },
  { label: "/api/lane 엔드포인트",   expected: "lanes 배열 반환", note: "SCM Lane API" },
  { label: "/api/ops/ingest",       expected: "Neptune counts",  note: "온톨로지 적재 상태" },
];

const ALL_LABELS = [
  ...NODE_CHECKS.map((c) => c.label),
  ...API_CHECKS.map((c) => c.label),
];

export default function ValidationPage() {
  const [checks, setChecks] = useState<ValidationCheck[]>(
    [
      ...NODE_CHECKS.map((c) => ({
        label: c.label, expected: `≥ ${c.min.toLocaleString()}`,
        note: c.note, status: "unknown" as const,
      })),
      ...API_CHECKS.map((c) => ({ ...c, status: "unknown" as const })),
    ]
  );
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  async function runChecks() {
    setRunning(true);
    const results: ValidationCheck[] = [];

    // ── Node-count checks via /api/ops/ingest ────────────────────────────
    let ingest: IngestStatus | null = null;
    let ingestError: string | null = null;
    try {
      ingest = await opsIngest();
    } catch (e) {
      ingestError = e instanceof Error ? e.message : String(e);
    }
    for (const c of NODE_CHECKS) {
      if (ingest) {
        const actual = ingest.neptune[c.neptuneLabel] ?? 0;
        results.push({
          label: c.label,
          expected: `≥ ${c.min.toLocaleString()}`,
          actual: actual.toLocaleString(),
          status: actual >= c.min ? "pass" : "fail",
          note: c.note,
        });
      } else {
        results.push({
          label: c.label,
          expected: `≥ ${c.min.toLocaleString()}`,
          actual: ingestError ? `ingest 오류: ${ingestError.slice(0, 60)}` : "ingest 미응답",
          status: "fail",
          note: c.note,
        });
      }
    }

    // ── API endpoint checks ──────────────────────────────────────────────
    try {
      const r = await fetch("/api/healthz");
      results.push({
        label: "/api/healthz", expected: "200 OK",
        actual: `${r.status}`, status: r.ok ? "pass" : "fail",
        note: "API 상태 확인",
      });
    } catch (e) {
      results.push({
        label: "/api/healthz", expected: "200 OK",
        actual: e instanceof Error ? e.message.slice(0, 60) : "연결 실패",
        status: "fail", note: "API 상태 확인",
      });
    }

    try {
      const r = (await api.lanes()) as { lanes?: unknown[] } | unknown[];
      const laneArr = Array.isArray(r) ? r : (r as { lanes?: unknown[] }).lanes ?? [];
      results.push({
        label: "/api/lane 엔드포인트", expected: "lanes 배열 반환",
        actual: `${laneArr.length}개 lanes`,
        status: laneArr.length > 0 ? "pass" : "fail",
        note: "SCM Lane API",
      });
    } catch (e) {
      results.push({
        label: "/api/lane 엔드포인트", expected: "lanes 배열 반환",
        actual: e instanceof Error ? e.message.slice(0, 60) : "오류",
        status: "fail", note: "SCM Lane API",
      });
    }

    if (ingest) {
      const totalLabels = Object.entries(ingest.neptune).filter(([k]) => !k.startsWith(":")).length;
      results.push({
        label: "/api/ops/ingest", expected: "Neptune counts",
        actual: `${totalLabels}개 라벨 · ${ingest.opensearch_docs.toLocaleString()} OS docs`,
        status: totalLabels > 0 ? "pass" : "fail",
        note: "온톨로지 적재 상태",
      });
    } else {
      results.push({
        label: "/api/ops/ingest", expected: "Neptune counts",
        actual: ingestError ? ingestError.slice(0, 80) : "응답 없음",
        status: "fail", note: "온톨로지 적재 상태",
      });
    }

    // Preserve display order matching the static spec list
    setChecks(
      results.sort(
        (a, b) =>
          ALL_LABELS.indexOf(a.label) - ALL_LABELS.indexOf(b.label),
      ),
    );
    setLastRun(new Date().toISOString().slice(11, 19));
    setRunning(false);
  }

  // Auto-run on first mount so users see live status without clicking.
  useEffect(() => { runChecks(); }, []);

  const passes = checks.filter((c) => c.status === "pass").length;
  const fails  = checks.filter((c) => c.status === "fail").length;

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader
        title="검증 리포트"
        tech="Cypher 카운트 + API 엔드포인트 라이브 검증 → spec § 8.4 매트릭스"
      />
      <div className="flex-1 mx-auto w-full max-w-4xl px-6 py-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-50 mb-1">검증 리포트</h1>
            <p className="text-sm text-ink-400">
              스펙 § 8.4 노드 수 + API 상태 라이브 검증
              {lastRun && <span className="ml-2 text-ink-500">· 마지막 실행 {lastRun}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="px-2.5 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 font-mono">
              ✓ {passes}
            </span>
            <span className="px-2.5 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200 font-mono">
              ✗ {fails}
            </span>
            <button
              onClick={runChecks}
              disabled={running}
              className="flex items-center gap-2 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-4 py-2 rounded-md text-sm transition"
            >
              <RefreshCw className={`w-4 h-4 ${running ? "animate-spin" : ""}`} />
              {running ? "실행 중…" : "다시 실행"}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {checks.map((c) => (
            <div key={c.label} className="flex items-start gap-3 bg-ink-800 border border-ink-700 rounded-lg p-4">
              {c.status === "pass" && <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
              {c.status === "fail" && <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
              {c.status === "unknown" && <AlertCircle className="w-5 h-5 text-ink-500 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink-100">{c.label}</div>
                <div className="flex items-center gap-3 mt-1 text-xs flex-wrap">
                  <span className="text-ink-400">기대: <span className="text-ink-200">{c.expected}</span></span>
                  {c.actual !== undefined && (
                    <span className="text-ink-400">
                      실제:{" "}
                      <span
                        className={
                          c.status === "pass"
                            ? "text-emerald-300"
                            : c.status === "fail"
                              ? "text-red-300"
                              : "text-ink-500"
                        }
                      >
                        {c.actual}
                      </span>
                    </span>
                  )}
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
