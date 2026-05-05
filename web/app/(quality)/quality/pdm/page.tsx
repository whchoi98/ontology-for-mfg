"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";

interface SensorRow {
  sensor_id: string;
  name?: string;
  value?: number;
  unit?: string;
  status?: string;
}

interface Alert {
  sensor_id: string;
  message: string;
  severity?: string;
}

export default function QualityPdmPage() {
  const [plantId, setPlantId] = useState("PLANT-KR-01");
  const [sensors, setSensors] = useState<SensorRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = (await api.pdm(plantId)) as {
      sensors?: SensorRow[];
      alerts?: Alert[];
    };
    setSensors(r.sensors ?? []);
    setAlerts(r.alerts ?? []);
    setLoading(false);
  }

  return (
    <div>
      <h1 className="font-bold text-xl mb-3">예지 보전 (Quality)</h1>
      <form onSubmit={submit} className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="Plant ID"
          value={plantId}
          onChange={(e) => setPlantId(e.target.value)}
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          {loading ? "..." : "조회"}
        </button>
      </form>
      {alerts.length > 0 && (
        <div className="bg-red-600 text-white rounded-lg px-4 py-3 mb-4 font-bold">
          ⚠ 알람 {alerts.length}건 발생 — 즉시 점검 필요
          <ul className="mt-2 font-normal text-sm space-y-1">
            {alerts.map((a, i) => (
              <li key={i}>
                [{a.severity ?? "HIGH"}] {a.sensor_id}: {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {sensors.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse bg-white rounded border">
            <thead className="bg-neutral-100">
              <tr>
                <th className="border px-3 py-2 text-left">센서 ID</th>
                <th className="border px-3 py-2 text-left">이름</th>
                <th className="border px-3 py-2 text-right">값</th>
                <th className="border px-3 py-2 text-center">상태</th>
              </tr>
            </thead>
            <tbody>
              {sensors.map((s, i) => (
                <tr key={i} className="hover:bg-neutral-50">
                  <td className="border px-3 py-2 font-mono text-xs">{s.sensor_id}</td>
                  <td className="border px-3 py-2">{s.name ?? "-"}</td>
                  <td className="border px-3 py-2 text-right">
                    {s.value != null ? `${s.value} ${s.unit ?? ""}` : "-"}
                  </td>
                  <td className="border px-3 py-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        s.status === "OK"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
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
  );
}
