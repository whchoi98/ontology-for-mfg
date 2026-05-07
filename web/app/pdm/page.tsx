"use client";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api-client";
import { useActivePersona } from "@/lib/persona-context";
import { ScenarioHeader } from "@/components/ScenarioHeader";

interface SensorRow { sensor_id: string; name?: string; value?: number; unit?: string; status?: string; }
interface Alert { sensor_id: string; message: string; severity?: string; }

export default function PdmPage() {
  const { active } = useActivePersona();
  const [plantId, setPlantId] = useState("PLANT-KR-01");
  const [sensors, setSensors] = useState<SensorRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = (await api.pdm(plantId)) as { sensors?: SensorRow[]; alerts?: Alert[] };
    setSensors(r.sensors ?? []);
    setAlerts(r.alerts ?? []);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="L" title="PdM / IoT" tech="OpenSearch Telemetry + 임계 비교 → 알람 분류 + 정비 권고" />
      <div className="flex-1 mx-auto w-full max-w-4xl px-6 py-6">
        <h1 className="text-2xl font-bold text-ink-50 mb-1">예지 보전 / IoT</h1>
        <p className="text-sm text-ink-400 mb-4">공장 IoT 텔레메트리 + 예지 보전 알람 + 정비 이벤트 추천</p>
        <form onSubmit={submit} className="flex gap-2 mb-6">
          <select
            className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-accent-500"
            value={plantId}
            onChange={(e) => setPlantId(e.target.value)}
          >
            <option value="PLANT-KR-01">PLANT-KR-01 (구미)</option>
            <option value="PLANT-KR-02">PLANT-KR-02 (평택)</option>
            <option value="PLANT-VN-01">PLANT-VN-01 (하노이)</option>
            <option value="PLANT-MX-01">PLANT-MX-01 (몬테레이)</option>
          </select>
          <button
            type="submit"
            className="bg-accent-500 hover:bg-accent-400 text-ink-950 font-semibold px-4 py-2 rounded-md text-sm transition"
          >
            {loading ? "조회 중..." : "조회"}
          </button>
        </form>

        {alerts.length > 0 && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4">
            <div className="flex items-center gap-2 text-red-300 font-bold mb-3">
              <AlertTriangle className="w-5 h-5" />
              알람 {alerts.length}건 발생 — 즉시 점검 필요
            </div>
            <ul className="space-y-1.5">
              {alerts.map((a, i) => (
                <li key={i} className="text-sm text-red-200">
                  <span className="font-mono text-[10px] bg-red-500/20 px-1.5 py-0.5 rounded mr-2">{a.severity ?? "HIGH"}</span>
                  {a.sensor_id}: {a.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {sensors.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-ink-700">
            <table className="w-full text-sm">
              <thead className="bg-ink-800">
                <tr>
                  {["센서 ID","이름","값","상태"].map((h) => (
                    <th key={h} className="border-b border-ink-700 px-4 py-3 text-left text-xs text-ink-300 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sensors.map((s, i) => (
                  <tr key={i} className="border-b border-ink-700/40 hover:bg-ink-800/50">
                    <td className="px-4 py-3 font-mono text-xs text-ink-400">{s.sensor_id}</td>
                    <td className="px-4 py-3 text-ink-200">{s.name ?? "-"}</td>
                    <td className="px-4 py-3 text-ink-200 font-mono">
                      {s.value != null ? `${s.value} ${s.unit ?? ""}` : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={[
                        "px-2 py-0.5 rounded text-xs font-medium",
                        s.status === "OK" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300",
                      ].join(" ")}>
                        {s.status ?? "-"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
