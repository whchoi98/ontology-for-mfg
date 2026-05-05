"use client";

import { useEffect, useState } from "react";
import { Database, ShieldCheck, Brain, Activity, ListTree } from "lucide-react";

const AREA_META: Record<string, { ko: string; icon: React.ComponentType<{ className?: string }> }> = {
  ingest:    { ko: "데이터 적재",       icon: Database },
  guardrail: { ko: "가드레일 (4 토픽)", icon: ShieldCheck },
  memory:    { ko: "메모리 히스토리",   icon: Brain },
  eval:      { ko: "평가 결과",         icon: Activity },
  trace:     { ko: "도구 호출 트레이스", icon: ListTree },
};

export default function OpsPage({ params }: { params: { area: string } }) {
  const meta = AREA_META[params.area] ?? { ko: params.area, icon: Database };
  const Icon = meta.icon;
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/ops/${encodeURIComponent(params.area)}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        setData(await r.json());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.area]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400 flex items-center gap-2">
          <span>파이프라인</span>
          <span className="text-ink-600">/</span>
          <span className="text-ink-200">{meta.ko}</span>
        </div>
      </header>
      <div className="flex-1 p-6">
        <h1 className="text-2xl font-bold text-ink-50 mb-1 flex items-center gap-2">
          <Icon className="w-6 h-6 text-accent-400" />
          {meta.ko}
        </h1>
        <p className="text-sm text-ink-400 mb-6">Ops 콘솔 — /api/ops/{params.area}</p>

        {loading && (
          <div className="text-ink-500 text-sm italic">로딩 중…</div>
        )}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            오류: {error}
            <div className="text-xs text-ink-400 mt-1">이 엔드포인트가 아직 구현되지 않았거나 인증이 필요할 수 있습니다.</div>
          </div>
        )}
        {!loading && !error && data !== null && (
          <div className="bg-ink-800 border border-ink-700 rounded-lg p-5">
            <pre className="text-xs font-mono text-ink-200 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(data as Record<string, unknown>, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
