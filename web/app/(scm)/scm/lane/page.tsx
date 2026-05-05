"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { SCMMap } from "@/components/SCMMap";
import type { TradeLane } from "@/lib/types";

export default function ScmLanePage() {
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
    const r = (await api.reroute(event)) as {
      lanes?: TradeLane[];
      message?: string;
    };
    if (r.lanes) {
      setLanes((prev) => {
        const byId = new Map(prev.map((l) => [l.id, l]));
        r.lanes!.forEach((l) => byId.set(l.id, l));
        return Array.from(byId.values());
      });
    }
    setRerouteMsg(r.message ?? `${event} 재경로 완료`);
    setTimeout(() => setRerouteMsg(""), 4000);
  }

  return (
    <div>
      <h1 className="font-bold text-xl mb-3">글로벌 Lane 지도 (SCM)</h1>
      <div className="flex gap-3 mb-4">
        <button
          onClick={() => triggerReroute("IRA_2026")}
          className="bg-red-600 text-white px-4 py-2 rounded font-medium hover:bg-red-700"
        >
          Trigger IRA 2026
        </button>
        <button
          onClick={() => triggerReroute("USMCA_2025")}
          className="bg-emerald-600 text-white px-4 py-2 rounded font-medium hover:bg-emerald-700"
        >
          Trigger USMCA 2025
        </button>
        {rerouteMsg && (
          <span className="flex items-center text-sm font-medium text-neutral-700">
            {rerouteMsg}
          </span>
        )}
      </div>
      {loading ? (
        <div className="h-[400px] flex items-center justify-center text-neutral-500">
          Lane 데이터 로딩 중...
        </div>
      ) : (
        <SCMMap lanes={lanes} />
      )}
    </div>
  );
}
