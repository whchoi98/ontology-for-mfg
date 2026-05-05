"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";

interface EightDSection {
  section: string;
  title: string;
  content: string;
}

const SECTION_LABELS: Record<string, string> = {
  D1: "D1 — 팀 구성 (Team Formation)",
  D2: "D2 — 문제 설명 (Problem Description)",
  D3: "D3 — 긴급 조치 (Containment Action)",
  D4: "D4 — 근본 원인 분석 (Root Cause Analysis)",
  D5: "D5 — 영구 시정 조치 (Permanent Corrective Action)",
  D6: "D6 — 시정 조치 실행 (Corrective Action Implementation)",
  D7: "D7 — 재발 방지 (Recurrence Prevention)",
  D8: "D8 — 팀 공로 인정 (Recognition)",
};

export default function PlantEightDPage() {
  const [incidentId, setIncidentId] = useState("INC-2026-0412");
  const [sections, setSections] = useState<EightDSection[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set(["D1"]));
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = (await api.eightD(incidentId)) as { sections?: EightDSection[] };
    setSections(r.sections ?? []);
    setLoading(false);
  }

  function toggle(sec: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(sec) ? next.delete(sec) : next.add(sec);
      return next;
    });
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-bold text-xl mb-3">8D 보고서 (Plant)</h1>
      <form onSubmit={submit} className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="인시던트 ID"
          value={incidentId}
          onChange={(e) => setIncidentId(e.target.value)}
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          {loading ? "..." : "생성"}
        </button>
      </form>
      <div className="space-y-2">
        {sections.map((s) => (
          <div key={s.section} className="border rounded bg-white">
            <button
              className="w-full flex justify-between items-center px-4 py-2 text-sm font-medium hover:bg-neutral-50"
              onClick={() => toggle(s.section)}
            >
              <span>{SECTION_LABELS[s.section] ?? s.section}</span>
              <span>{open.has(s.section) ? "▲" : "▼"}</span>
            </button>
            {open.has(s.section) && (
              <div className="px-4 pb-3 text-sm text-neutral-700 border-t pt-2">
                {s.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
