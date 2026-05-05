"use client";
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { api } from "@/lib/api-client";
import { SCMMap } from "@/components/SCMMap";
import { useActivePersona } from "@/lib/persona-context";
import type { TradeLane } from "@/lib/types";

export default function LanePage() {
  const { active } = useActivePersona();
  const [lanes, setLanes] = useState<TradeLane[]>([]);
  const [loading, setLoading] = useState(true);
  const [rerouteMsg, setRerouteMsg] = useState("");

  useEffect(() => {
    api.lanes().then((r) => {
      const data = r as { lanes?: TradeLane[] } | TradeLane[];
      setLanes(Array.isArray(data) ? data : (data as { lanes?: TradeLane[] }).lanes ?? []);
      setLoading(false);
    });
  }, []);

  async function triggerReroute(event: string) {
    setRerouteMsg(`${event} 재경로 계산 중...`);
    const r = (await api.reroute(event)) as { lanes?: TradeLane[]; message?: string };
    if (r.lanes) {
      setLanes((prev) => {
        const byId = new Map(prev.map((l) => [l.id, l]));
        r.lanes!.forEach((l) => byId.set(l.id, l));
        return Array.from(byId.values());
      });
    }
    setRerouteMsg(r.message ?? `${event} 재경로 완료`);
    setTimeout(() => setRerouteMsg(""), 5000);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">시나리오 H · 글로벌 SCM lane</div>
        <span className="ml-3 text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-mono">WOW</span>
        <div className="ml-auto text-xs text-ink-500">페르소나: <span className="text-ink-200 font-medium">{active}</span></div>
      </header>
      <div className="flex-1 p-6">
        <h1 className="text-2xl font-bold text-ink-50 mb-1">글로벌 SCM Lane 지도</h1>
        <p className="text-sm text-ink-400 mb-4">7개국 trade lane + IRA/USMCA 이벤트 reroute 시뮬레이션</p>

        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <button
            onClick={() => triggerReroute("IRA_2026")}
            className="flex items-center gap-2 bg-red-600/80 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition"
          >
            <Zap className="w-4 h-4" />
            Trigger IRA 2026
          </button>
          <button
            onClick={() => triggerReroute("USMCA_2025")}
            className="flex items-center gap-2 bg-emerald-600/80 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition"
          >
            <Zap className="w-4 h-4" />
            Trigger USMCA 2025
          </button>
          {rerouteMsg && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-amber-300 animate-pulse-soft">
              ⟳ {rerouteMsg}
            </span>
          )}
        </div>

        {rerouteMsg && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-200 text-sm">
            ★ WOW: Lane 재경로가 계산되어 지도 위 경로가 업데이트됩니다. 멕시코·중국 경유 lane 변화를 확인하세요.
          </div>
        )}

        {loading ? (
          <div className="h-[400px] flex items-center justify-center text-ink-500 text-sm">
            Lane 데이터 로딩 중...
          </div>
        ) : (
          <SCMMap lanes={lanes} />
        )}
      </div>
    </div>
  );
}
