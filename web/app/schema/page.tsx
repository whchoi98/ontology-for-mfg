"use client";
import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";

const MFG_CLASSES = [
  // BOM
  { name: "Product",     group: "BOM",     desc: "완제품 — 최종 판매 단위 (LG 전자 TV/모니터 등)", color: "#60a5fa" },
  { name: "Module",      group: "BOM",     desc: "제조 모듈 — 복수 Component 집합", color: "#34d399" },
  { name: "Component",   group: "BOM",     desc: "부품 — 2,000+ 합성 SKU", color: "#fbbf24" },
  { name: "RawMaterial", group: "BOM",     desc: "원자재 — Cu/Fe/Rare-earth 등 500+ 항목", color: "#a78bfa" },
  // Supply
  { name: "Manufacturer",    group: "Supply", desc: "제조사 — 완제품 생산 법인 (20개)", color: "#f472b6" },
  { name: "Supplier",        group: "Supply", desc: "1차 협력사 — 직접 조달 (150개)", color: "#fb923c" },
  { name: "SubSupplier",     group: "Supply", desc: "2차 협력사 — 간접 조달 (300개)", color: "#94a3b8" },
  { name: "CustomerAccount", group: "Supply", desc: "OEM 고객 — B2B 납품 계정 (30개)", color: "#22d3ee" },
  { name: "Plant",           group: "Supply", desc: "공장 — 4개국 12개 시설", color: "#0ea5e9" },
  // Geo
  { name: "Region",    group: "Geo", desc: "지역 — KR/CN/VN/MX/US/EU/JP 7개국", color: "#38bdf8" },
  { name: "TradeLane", group: "Geo", desc: "운송 lane — 40개 SEA/AIR/RAIL/ROAD", color: "#14b8a6" },
  // Standards
  { name: "Standard",      group: "Standards", desc: "표준 — JEDEC/IPC/AEC-Q/IATF/ISO (80+)", color: "#facc15" },
  { name: "Certification", group: "Standards", desc: "인증 — AEC-Q100/IATF/RoHS (200+)", color: "#34d399" },
  { name: "Regulation",    group: "Standards", desc: "규제 — REACH/RoHS/PFAS/CBAM/IRA/USMCA (60+)", color: "#f87171" },
  { name: "Substance",     group: "Standards", desc: "화학물질 — REACH SVHC 240+ 항목", color: "#c084fc" },
  // Quality
  { name: "QualityIncident", group: "Quality", desc: "품질 인시던트 — 100건 합성", color: "#fca5a5" },
  { name: "EightDReport",    group: "Quality", desc: "8D 보고서 — 80건 합성", color: "#fdba74" },
  { name: "RootCause",       group: "Quality", desc: "근본원인 — 200개 노드", color: "#d9f99d" },
  // Ops/ESG
  { name: "Telemetry",        group: "Ops/ESG", desc: "IoT 텔레메트리 — 5,000+ 데이터포인트", color: "#6ee7b7" },
  { name: "MaintenanceEvent", group: "Ops/ESG", desc: "정비 이벤트 — 300건 합성", color: "#93c5fd" },
  { name: "ESGIndicator",     group: "Ops/ESG", desc: "ESG 지표 — Scope 1/2/3 + 수자원 등 (120)", color: "#86efac" },
  { name: "CarbonScope",      group: "Ops/ESG", desc: "탄소 Scope 집계 — 공장×분기 (36)", color: "#a5b4fc" },
];

const GROUPS = ["BOM", "Supply", "Geo", "Standards", "Quality", "Ops/ESG"];

export default function SchemaPage() {
  const [filter, setFilter] = useState("");
  const filtered = filter
    ? MFG_CLASSES.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()) || c.desc.includes(filter))
    : MFG_CLASSES;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">메타 · 온톨로지 스키마</div>
        <span className="ml-3 text-[10px] text-ink-500">22 클래스 · 합성 Hi-Tech MFG</span>
      </header>
      <div className="flex-1 p-6">
        <h1 className="text-2xl font-bold text-ink-50 mb-1 flex items-center gap-2">
          <GitBranch className="w-6 h-6 text-accent-400" />
          온톨로지 스키마 — 22 클래스
        </h1>
        <p className="text-sm text-ink-400 mb-6">
          JEDEC / IPC / AEC-Q / IATF 16949 / ISO 9001 + REACH / RoHS / CBAM / IRA / USMCA 표준 매핑 기반
        </p>

        <input
          className="w-full max-w-md bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500 mb-6"
          placeholder="클래스 필터..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        {GROUPS.map((group) => {
          const items = filtered.filter((c) => c.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-6">
              <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-2">{group}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {items.map((cls) => (
                  <div
                    key={cls.name}
                    className="rounded-lg border border-ink-700 bg-ink-900 p-4 hover:border-ink-600 transition"
                    style={{ borderLeftColor: cls.color, borderLeftWidth: 3 }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-ink-100 font-mono">{cls.name}</span>
                    </div>
                    <p className="text-xs text-ink-400 leading-relaxed">{cls.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
