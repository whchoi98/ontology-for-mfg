"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package, Boxes, Cpu, Layers, Factory, Building2, Building, Briefcase,
  MapPin, Truck, BookOpen, Award, Scale, FlaskConical, AlertTriangle,
  ClipboardList, GitBranch, Activity, Wrench, Leaf, Cloud, Network as NetworkIcon,
  ChevronRight, Search as SearchIcon,
} from "lucide-react";

const TYPE_META: Record<string, { ko: string; desc: string; color: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  Product:          { ko: "완제품",         desc: "최종 판매 단위",                   color: "#60a5fa", icon: Package },
  Module:           { ko: "모듈",           desc: "제조 모듈 — 복수 Component 집합",   color: "#34d399", icon: Boxes },
  Component:        { ko: "부품",           desc: "개별 부품 SKU",                    color: "#fbbf24", icon: Cpu },
  RawMaterial:      { ko: "원자재",         desc: "기초 소재 — Cu/Fe/Rare-earth 등",   color: "#a78bfa", icon: Layers },
  Manufacturer:     { ko: "제조사",         desc: "완제품 생산 법인",                  color: "#f472b6", icon: Factory },
  Supplier:         { ko: "1차 협력사",     desc: "직접 조달 협력사",                  color: "#fb923c", icon: Building2 },
  SubSupplier:      { ko: "2차 협력사",     desc: "간접 조달 협력사",                  color: "#94a3b8", icon: Building },
  CustomerAccount:  { ko: "OEM 고객",      desc: "B2B 납품 계정",                    color: "#22d3ee", icon: Briefcase },
  Plant:            { ko: "공장",           desc: "생산 시설 — 4개국 12개",            color: "#0ea5e9", icon: Building2 },
  Region:           { ko: "지역",           desc: "7개국 지역 분류",                   color: "#38bdf8", icon: MapPin },
  TradeLane:        { ko: "운송 lane",      desc: "글로벌 물류 경로",                  color: "#14b8a6", icon: Truck },
  Standard:         { ko: "표준",           desc: "JEDEC/IPC/AEC-Q/IATF/ISO",       color: "#facc15", icon: BookOpen },
  Certification:    { ko: "인증",           desc: "부품·공장 인증 레코드",              color: "#34d399", icon: Award },
  Regulation:       { ko: "규제",           desc: "REACH/RoHS/PFAS/CBAM/IRA/USMCA", color: "#f87171", icon: Scale },
  Substance:        { ko: "화학물질",       desc: "REACH SVHC 240+ 목록",             color: "#c084fc", icon: FlaskConical },
  QualityIncident:  { ko: "품질 인시던트",  desc: "품질 이슈 및 불량 사례",             color: "#fca5a5", icon: AlertTriangle },
  EightDReport:     { ko: "8D 리포트",      desc: "8D 문제해결 보고서",                color: "#fdba74", icon: ClipboardList },
  RootCause:        { ko: "근본원인",       desc: "인시던트 근본원인 분석",              color: "#d9f99d", icon: GitBranch },
  Telemetry:        { ko: "텔레메트리",     desc: "IoT 센서 데이터포인트",              color: "#6ee7b7", icon: Activity },
  MaintenanceEvent: { ko: "정비 이벤트",    desc: "장비 정비 및 점검 기록",             color: "#93c5fd", icon: Wrench },
  ESGIndicator:     { ko: "ESG 지표",      desc: "탄소·수자원·사회 지표",              color: "#86efac", icon: Leaf },
  CarbonScope:      { ko: "탄소 Scope",    desc: "Scope 1/2/3 집계",                 color: "#a5b4fc", icon: Cloud },
};

export default function ObjectTypePage({ params }: { params: { type: string } }) {
  const meta = TYPE_META[params.type] ?? { ko: params.type, desc: "", color: "#94a3b8", icon: NetworkIcon };
  const Icon = meta.icon;

  const [items, setItems] = useState<{ id: string; [k: string]: unknown }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<{ id: string; [k: string]: unknown } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setItems([]);
    setSelected(null);
    fetch(`/api/objects/${encodeURIComponent(params.type)}?limit=100`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        const d = await r.json();
        setItems(d.items ?? d ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.type]);

  const filtered = filter
    ? items.filter((it) => String(it.id).toLowerCase().includes(filter.toLowerCase()) ||
        String(it.name ?? "").toLowerCase().includes(filter.toLowerCase()))
    : items;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400 flex items-center gap-2">
          <Link href="/" className="hover:text-accent-300">홈</Link>
          <ChevronRight className="w-3 h-3" />
          <span>객체 탐색</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-ink-200">{meta.ko}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
            style={{ borderColor: `${meta.color}60`, color: meta.color, backgroundColor: `${meta.color}14` }}>
            {params.type}
          </span>
          {items.length > 0 && (
            <span className="text-[10px] font-mono text-ink-400">total {items.length}</span>
          )}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[320px_1fr] min-h-0">
        {/* List pane */}
        <aside className="border-r border-ink-700 bg-ink-900 flex flex-col">
          <div className="p-4 border-b border-ink-700 flex items-center gap-3">
            <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${meta.color}22`, border: `1px solid ${meta.color}55` }}>
              <Icon className="w-4 h-4" style={{ color: meta.color }} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink-100">{meta.ko}</div>
              <div className="text-[10px] text-ink-400 truncate">{meta.desc}</div>
            </div>
          </div>
          <div className="px-3 py-2 border-b border-ink-700 relative">
            <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`${meta.ko} 필터…`}
              className="w-full rounded bg-ink-800 border border-ink-700 text-xs pl-8 pr-3 py-1.5 text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500"
            />
          </div>
          <ul className="flex-1 overflow-y-auto">
            {error && (
              <li className="m-3 p-3 rounded text-xs bg-red-500/10 border border-red-500/30 text-red-300">{error}</li>
            )}
            {loading && !error && (
              <li className="text-xs text-ink-500 italic p-4">로딩 중…</li>
            )}
            {!loading && filtered.length === 0 && (
              <li className="text-xs text-ink-500 italic p-4">검색 결과 없음</li>
            )}
            {filtered.map((it) => {
              const active = it.id === selected?.id;
              return (
                <li key={it.id}>
                  <button
                    onClick={() => setSelected(it)}
                    className={[
                      "w-full text-left px-4 py-2.5 border-b border-ink-700/40 transition",
                      active ? "bg-accent-500/10 border-l-2 border-l-accent-500" : "hover:bg-ink-800",
                    ].join(" ")}
                  >
                    <div className={`text-sm font-medium truncate ${active ? "text-accent-200" : "text-ink-100"}`}>
                      {String(it.name ?? it.id)}
                    </div>
                    <div className="text-[10px] font-mono text-ink-500 truncate mt-0.5">{it.id}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Inspector pane */}
        <section className="p-6 overflow-y-auto">
          {selected ? (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${meta.color}22`, border: `1px solid ${meta.color}55` }}>
                  <Icon className="w-5 h-5" style={{ color: meta.color }} />
                </div>
                <div>
                  <div className="text-[10px] font-mono text-ink-400 uppercase tracking-wider">{params.type}</div>
                  <h2 className="text-xl font-bold text-ink-50">{String(selected.name ?? selected.id)}</h2>
                  <div className="text-[11px] font-mono text-ink-500 mt-0.5">{selected.id}</div>
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-3 font-semibold">속성</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(selected).filter(([k]) => k !== "__typename").map(([k, v]) => (
                  <div key={k} className="bg-ink-800 border border-ink-700 rounded-lg p-3">
                    <div className="text-[10px] font-mono text-ink-400 mb-1">{k}</div>
                    <div className="text-sm text-ink-100 break-words">
                      {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[400px] text-sm text-ink-500 italic">
              좌측에서 객체를 선택하면 속성이 표시됩니다.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
