"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Package, Boxes, Cpu, Layers, Factory, Building2, Building, Briefcase,
  MapPin, Truck, BookOpen, Award, Scale, FlaskConical, AlertTriangle,
  ClipboardList, GitBranch, Activity, Wrench, Leaf, Cloud,
  Network as NetworkIcon, Search as SearchIcon, ChevronRight,
  PanelRightClose, PanelRightOpen,
} from "lucide-react";
import { ScenarioHeader } from "@/components/ScenarioHeader";

const CytoscapeView = dynamic(
  () => import("@/components/CytoscapeView").then((m) => m.CytoscapeView),
  { ssr: false },
);

const TYPE_META: Record<
  string,
  { ko: string; desc: string; color: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }
> = {
  Product:          { ko: "완제품",        desc: "최종 판매 단위 — AMZN Tech 5 라인",           color: "#60a5fa", icon: Package },
  Module:           { ko: "모듈",          desc: "복수 Component 집합 — 디스플레이/인버터 등", color: "#34d399", icon: Boxes },
  Component:        { ko: "부품",          desc: "개별 부품 SKU — IC/PCB/커넥터/모터 등",       color: "#fbbf24", icon: Cpu },
  RawMaterial:      { ko: "원자재",        desc: "기초 소재 — 실리콘 웨이퍼, Cu, Al 등",        color: "#a78bfa", icon: Layers },
  Manufacturer:     { ko: "제조사",        desc: "AMZN Tech 4개 사업부 (HA/HE/VS/Innotek)",     color: "#f472b6", icon: Factory },
  Supplier:         { ko: "1차 협력사",    desc: "직접 조달 협력사 — RFM 점수 보유",            color: "#fb923c", icon: Building2 },
  SubSupplier:      { ko: "2차 협력사",    desc: "간접 조달 협력사",                            color: "#94a3b8", icon: Building },
  CustomerAccount:  { ko: "OEM 고객",     desc: "B2B 납품 계정 — Auto/Tier-1/통신 등",         color: "#22d3ee", icon: Briefcase },
  Plant:            { ko: "공장",          desc: "생산 시설 — 7개국 분포 (KR/CN/VN/MX/PL/US/IN)", color: "#0ea5e9", icon: Building2 },
  Region:           { ko: "지역",          desc: "글로벌 SCM 7개국 지역 분류",                  color: "#38bdf8", icon: MapPin },
  TradeLane:        { ko: "운송 lane",     desc: "글로벌 물류 경로 — IRA/USMCA/CBAM 태그",      color: "#14b8a6", icon: Truck },
  Standard:         { ko: "표준",          desc: "JEDEC/IPC/AEC-Q/IATF/ISO 등",                color: "#facc15", icon: BookOpen },
  Certification:    { ko: "인증",          desc: "부품·공장 인증 레코드 (만료일 포함)",          color: "#34d399", icon: Award },
  Regulation:       { ko: "규제",          desc: "REACH/RoHS/CBAM/IRA/USMCA",                  color: "#f87171", icon: Scale },
  Substance:        { ko: "화학물질",      desc: "REACH SVHC 250 + RoHS 6+4 + CMR",            color: "#c084fc", icon: FlaskConical },
  QualityIncident:  { ko: "품질 인시던트",  desc: "품질 이슈 및 불량 사례 — 심각도별",           color: "#fca5a5", icon: AlertTriangle },
  EightDReport:     { ko: "8D 리포트",     desc: "8D 문제해결 보고서 (D1~D8)",                  color: "#fdba74", icon: ClipboardList },
  RootCause:        { ko: "근본원인",      desc: "인시던트 근본원인 — Supplier/Component/Plant 연결", color: "#d9f99d", icon: GitBranch },
  Telemetry:        { ko: "텔레메트리",    desc: "IoT 센서 메타데이터 — 진동/온도/전류 등",      color: "#6ee7b7", icon: Activity },
  MaintenanceEvent: { ko: "정비 이벤트",   desc: "PM/CM/PdM — 정비 이력",                       color: "#93c5fd", icon: Wrench },
  ESGIndicator:     { ko: "ESG 지표",     desc: "수자원·폐기물·재해·다양성 등",                 color: "#86efac", icon: Leaf },
  CarbonScope:      { ko: "탄소 Scope",   desc: "Scope 1/2/3 집계 (Plant × Period)",          color: "#a5b4fc", icon: Cloud },
};

interface ListItem { id: string; name: string; rank_score?: number; properties?: Record<string, unknown> }
interface ListResponse { type: string; label: string; total: number; items: ListItem[]; _synthetic?: boolean }
interface DetailResponse {
  type: string; label: string; id: string; name: string;
  properties: Record<string, unknown>;
  subgraph: {
    nodes: Array<{ data: { id: string; label?: string; [k: string]: unknown } }>;
    edges: Array<{ data: { id: string; source: string; target: string; type?: string } }>;
  };
  neighbor_summary: Record<string, number>;
}

export default function ObjectTypePage({ params }: { params: { type: string } }) {
  const meta = TYPE_META[params.type] ?? { ko: params.type, desc: "", color: "#94a3b8", icon: NetworkIcon };
  const Icon = meta.icon;

  const [list, setList] = useState<ListResponse | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailSlug, setDetailSlug] = useState<string>(params.type);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // List load — refresh when slug changes
  useEffect(() => {
    setList(null);
    setListError(null);
    setSelectedId(null);
    setDetail(null);
    setDetailSlug(params.type);
    fetch(`/api/objects/${encodeURIComponent(params.type)}?limit=100`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        const d: ListResponse = await r.json();
        setList(d);
      })
      .catch((e) => setListError(String(e)));
  }, [params.type]);

  // Auto-select first item once list arrives
  useEffect(() => {
    if (list && list.items.length && !selectedId) setSelectedId(list.items[0].id);
  }, [list, selectedId]);

  // Detail load — fetch subgraph for current selection
  useEffect(() => {
    if (!selectedId || !detailSlug) return;
    setDetailLoading(true);
    setDetailError(null);
    fetch(`/api/objects/${encodeURIComponent(detailSlug)}/${encodeURIComponent(selectedId)}`,
      { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        const d: DetailResponse = await r.json();
        setDetail(d);
      })
      .catch((e) => setDetailError(String(e)))
      .finally(() => setDetailLoading(false));
  }, [selectedId, detailSlug]);

  const filteredItems = useMemo(() => {
    if (!list) return [];
    const f = filter.trim().toLowerCase();
    if (!f) return list.items;
    return list.items.filter(
      (it) => it.name.toLowerCase().includes(f) || it.id.toLowerCase().includes(f),
    );
  }, [list, filter]);

  function handleNodeTap(nodeId: string, nodeLabel: string) {
    if (!nodeId) return;
    setDetailSlug(nodeLabel);
    setSelectedId(nodeId);
    if (!inspectorOpen) setInspectorOpen(true);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader
        title={`객체 탐색 · ${meta.ko}`}
        tech={`Cypher MATCH(n:${params.type}) → 1-hop neighbors → Cytoscape 그래프 + 속성 인스펙터`}
        rightSlot={
          <div className="flex items-center gap-2">
            <Link href="/" className="text-xs text-ink-400 hover:text-accent-300">홈</Link>
            <ChevronRight className="w-3 h-3 text-ink-600" />
            <span className="text-xs text-ink-200">{meta.ko}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border ml-2"
              style={{ borderColor: `${meta.color}60`, color: meta.color, backgroundColor: `${meta.color}14` }}>
              :{params.type}
            </span>
            {list && (
              <span className="text-[10px] font-mono text-ink-400">total {list.total}{list._synthetic ? " (demo)" : ""}</span>
            )}
          </div>
        }
      />

      <div
        className={[
          "flex-1 grid grid-cols-1 min-h-0",
          inspectorOpen
            ? "xl:grid-cols-[280px_1fr_340px]"
            : "xl:grid-cols-[280px_1fr]",
        ].join(" ")}
      >
        {/* List pane */}
        <aside className="border-r border-ink-700 bg-ink-900 flex flex-col min-h-0">
          <div className="p-4 border-b border-ink-700 flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${meta.color}22`, border: `1px solid ${meta.color}55` }}
            >
              <Icon className="w-4 h-4" style={{ color: meta.color }} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink-100 truncate">{meta.ko}</div>
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
            {listError && (
              <li className="m-3 p-3 rounded text-xs bg-red-500/10 border border-red-500/30 text-red-300">{listError}</li>
            )}
            {!list && !listError && (
              <li className="text-xs text-ink-500 italic p-4">로딩 중…</li>
            )}
            {list && filteredItems.length === 0 && (
              <li className="text-xs text-ink-500 italic p-4">검색 결과 없음</li>
            )}
            {filteredItems.map((it) => {
              const active = it.id === selectedId;
              return (
                <li key={it.id}>
                  <button
                    onClick={() => { setDetailSlug(params.type); setSelectedId(it.id); }}
                    className={[
                      "w-full text-left px-4 py-2.5 border-b border-ink-700/40 transition",
                      active
                        ? "bg-accent-500/10 border-l-2 border-l-accent-500"
                        : "hover:bg-ink-800",
                    ].join(" ")}
                  >
                    <div className={`text-sm font-medium truncate ${active ? "text-accent-200" : "text-ink-100"}`}>
                      {it.name}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] font-mono text-ink-500 truncate">{it.id}</span>
                      {(it.rank_score ?? 0) > 0 && (
                        <span className="text-[10px] font-mono text-ink-400">·{it.rank_score}</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Graph canvas (1-hop neighborhood) */}
        <section className="relative min-h-[600px] xl:min-h-0 p-4 flex flex-col">
          <div className="mb-2 flex items-center gap-2 text-xs flex-wrap">
            {detail ? (
              <>
                <span
                  className="px-1.5 py-0.5 rounded font-mono text-[10px] border"
                  style={{ borderColor: `${meta.color}60`, color: meta.color, backgroundColor: `${meta.color}14` }}
                >
                  {detail.label}
                </span>
                <span className="text-ink-100 font-semibold truncate">{detail.name}</span>
                <span className="font-mono text-[10px] text-ink-500 truncate">{detail.id}</span>
                {Object.entries(detail.neighbor_summary).slice(0, 6).map(([lbl, cnt]) => (
                  <span key={lbl} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 text-ink-300 border border-ink-700">
                    {lbl} ·{cnt}
                  </span>
                ))}
              </>
            ) : (
              <span className="text-ink-500 italic">객체를 선택하세요</span>
            )}
            <button
              type="button"
              onClick={() => setInspectorOpen((v) => !v)}
              className="ml-auto px-2.5 py-1 text-xs rounded-md border border-ink-600 bg-ink-800 text-ink-200 hover:bg-ink-700 hover:border-accent-500/60 flex items-center gap-1.5"
              title={inspectorOpen ? "속성 패널 접기" : "속성 패널 펴기"}
            >
              {inspectorOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
              {inspectorOpen ? "속성 접기" : "속성 펴기"}
            </button>
          </div>

          {detailLoading && (
            <div className="flex-1 flex items-center justify-center text-sm text-ink-400">
              그래프 로딩 중…
            </div>
          )}
          {detailError && !detailLoading && (
            <div className="m-3 p-3 rounded text-sm bg-red-500/10 border border-red-500/30 text-red-300">{detailError}</div>
          )}
          {!detailLoading && detail && (
            <div className="flex-1 min-h-[600px]">
              <CytoscapeView
                graph={detail.subgraph}
                anchorIds={[selectedId ?? ""]}
                onNodeTap={handleNodeTap}
              />
            </div>
          )}
          {!detailLoading && !detail && !detailError && (
            <div className="flex-1 flex items-center justify-center text-sm text-ink-500">
              좌측에서 객체를 선택하면 1-hop 관계 그래프가 표시됩니다.
            </div>
          )}
        </section>

        {/* Inspector pane */}
        {inspectorOpen && (
          <aside className="border-l border-ink-700 bg-ink-900 flex flex-col min-h-0">
            {detail ? (
              <>
                <div className="p-4 border-b border-ink-700">
                  <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-0.5">{detail.label}</div>
                  <h2 className="text-base font-bold text-ink-50 leading-tight">{detail.name}</h2>
                  <div className="text-[11px] font-mono text-ink-500 mt-1 truncate">id: {detail.id}</div>
                  {Object.keys(detail.neighbor_summary).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {Object.entries(detail.neighbor_summary).map(([lbl, cnt]) => (
                        <span key={lbl} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 text-ink-300 border border-ink-700">
                          {lbl} ·{cnt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">속성</div>
                  <ul className="space-y-2">
                    {Object.entries(detail.properties).map(([k, v]) => (
                      <li key={k} className="text-xs">
                        <div className="text-ink-400 font-mono text-[10px]">{k}</div>
                        <div className="text-ink-100 break-words">
                          {typeof v === "object" && v !== null
                            ? JSON.stringify(v)
                            : String(v ?? "—")}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-ink-500 italic px-4 text-center">
                선택된 객체의 속성과 인접 통계가 여기에 표시됩니다.
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
