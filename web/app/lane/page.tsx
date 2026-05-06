"use client";
import { useEffect, useState } from "react";
import { Zap, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { SCMMap } from "@/components/SCMMap";
import { useActivePersona } from "@/lib/persona-context";
import type { TradeLane } from "@/lib/types";
import { ScenarioHeader } from "@/components/ScenarioHeader";

interface RerouteResult {
  event: string;
  lanes_to_drop?: TradeLane[];
  new_lanes?: TradeLane[];
  message?: string;
}

export default function LanePage() {
  const { active } = useActivePersona();
  const [lanes, setLanes] = useState<TradeLane[]>([]);
  const [loading, setLoading] = useState(true);
  const [rerouteBanner, setRerouteBanner] = useState<RerouteResult | null>(null);
  const [droppedIds, setDroppedIds] = useState<string[]>([]);
  const [addedIds, setAddedIds] = useState<string[]>([]);

  useEffect(() => {
    api.lanes().then((r) => {
      const data = r as { lanes?: TradeLane[] } | TradeLane[];
      setLanes(Array.isArray(data) ? data : (data as { lanes?: TradeLane[] }).lanes ?? []);
      setLoading(false);
    });
  }, []);

  async function triggerReroute(event: string) {
    setRerouteBanner({ event, message: `${event} 재경로 계산 중...` });
    const r = (await api.reroute(event)) as {
      lanes?: TradeLane[];
      lanes_to_drop?: TradeLane[];
      new_lanes?: TradeLane[];
      message?: string;
    };

    const dropped = (r.lanes_to_drop ?? []).map((l) => l.id);
    const added = (r.new_lanes ?? []).map((l) => l.id);

    setDroppedIds(dropped);
    setAddedIds(added);

    if (r.lanes) {
      setLanes((prev) => {
        const byId = new Map(prev.map((l) => [l.id, l]));
        r.lanes!.forEach((l) => byId.set(l.id, l));
        return Array.from(byId.values());
      });
    } else {
      // Merge in new_lanes from reroute delta
      if (r.new_lanes?.length) {
        setLanes((prev) => {
          const byId = new Map(prev.map((l) => [l.id, l]));
          r.new_lanes!.forEach((l) => byId.set(l.id, l));
          return Array.from(byId.values());
        });
      }
    }

    setRerouteBanner({
      event,
      lanes_to_drop: r.lanes_to_drop,
      new_lanes: r.new_lanes,
      message: r.message ?? `${event} 재경로 완료`,
    });
  }

  function clearReroute() {
    setRerouteBanner(null);
    setDroppedIds([]);
    setAddedIds([]);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="H" title="글로벌 SCM Lane" tech="Cypher TradeLane + IRA/USMCA/CBAM 규제 매핑 → reroute 시뮬 + CBAM 부담액 환산" wow={true} />
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
        </div>

        {rerouteBanner && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-200 text-sm relative">
            <button
              onClick={clearReroute}
              className="absolute top-2 right-2 text-orange-400 hover:text-orange-200"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="font-semibold mb-1">
              {rerouteBanner.event === "IRA_2026" ? "IRA 2026 발효" : "USMCA 2025 갱신"} —
              Lane 재경로 결과
            </div>
            {rerouteBanner.lanes_to_drop && (
              <div className="text-xs mt-1">
                <span className="text-red-400 font-medium">제거 lane {rerouteBanner.lanes_to_drop.length}개:</span>{" "}
                {rerouteBanner.lanes_to_drop.map((l) => `${l.origin_region}→${l.dest_region}`).join(", ") || "없음"}
              </div>
            )}
            {rerouteBanner.new_lanes && rerouteBanner.new_lanes.length > 0 && (
              <div className="text-xs mt-1">
                <span className="text-emerald-400 font-medium">신규 lane {rerouteBanner.new_lanes.length}개:</span>{" "}
                {rerouteBanner.new_lanes.map((l) => `${l.origin_region}→${l.dest_region}`).join(", ")}
              </div>
            )}
            <div className="text-xs mt-2 text-ink-400">
              지도에서 <span className="text-red-400 font-medium">점선 빨간색</span> = 제거 lane,
              <span className="text-emerald-400 font-medium"> 굵은 초록색</span> = 신규 lane
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-3 text-xs text-ink-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-1 bg-red-500" />IRA-30D
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-1 bg-emerald-500" />USMCA
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-1 bg-amber-500" />CBAM
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-1 bg-neutral-500" />normal
          </span>
          {droppedIds.length > 0 && (
            <span className="flex items-center gap-1.5 text-red-400">
              <span className="inline-block w-6 border-t-2 border-dashed border-red-400" />제거됨
            </span>
          )}
          {addedIds.length > 0 && (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="inline-block w-6 border-t-4 border-emerald-400" />신규 (NEW)
            </span>
          )}
        </div>

        {loading ? (
          <div className="h-[400px] flex items-center justify-center text-ink-500 text-sm">
            Lane 데이터 로딩 중...
          </div>
        ) : (
          <SCMMap lanes={lanes} droppedIds={droppedIds} addedIds={addedIds} />
        )}
      </div>
    </div>
  );
}
