"use client";
import { useEffect, useMemo, useState } from "react";
import { Zap, X, Filter, Activity, AlertTriangle, RotateCcw, FileDown } from "lucide-react";
import { api } from "@/lib/api-client";
import { exportToPdf } from "@/lib/pdf-export";
import { SCMMap } from "@/components/SCMMap";
import type { TradeLane } from "@/lib/types";
import { ScenarioHeader } from "@/components/ScenarioHeader";

interface RerouteResult {
  event: string;
  lanes_to_drop?: TradeLane[];
  new_lanes?: TradeLane[];
  message?: string;
}

const MODES: ("SEA" | "AIR" | "RAIL" | "ROAD")[] = ["SEA", "AIR", "RAIL", "ROAD"];
const REGS = ["IRA-30D", "USMCA-Auto75", "CBAM", "PLAIN"] as const;

const REGION_LABEL_SHORT: Record<string, string> = {
  KR: "한국", CN: "중국", VN: "베트남", MX: "멕시코", PL: "폴란드", US: "미국", IN: "인도",
};

const REG_TONE: Record<string, string> = {
  "IRA-30D":      "border-red-500/40 bg-red-500/10 text-red-200",
  "USMCA-Auto75": "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  "CBAM":         "border-amber-500/40 bg-amber-500/10 text-amber-200",
  "PLAIN":        "border-slate-500/40 bg-slate-500/10 text-slate-200",
};

const MODE_TONE: Record<string, string> = {
  SEA:  "border-sky-500/40 bg-sky-500/10 text-sky-200",
  AIR:  "border-violet-500/40 bg-violet-500/10 text-violet-200",
  RAIL: "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
  ROAD: "border-amber-500/40 bg-amber-500/10 text-amber-200",
};

export default function LanePage() {
  const [lanes, setLanes] = useState<TradeLane[]>([]);
  const [loading, setLoading] = useState(true);
  const [rerouteBanner, setRerouteBanner] = useState<RerouteResult | null>(null);
  const [droppedIds, setDroppedIds] = useState<string[]>([]);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [modeFilter, setModeFilter] = useState<Set<string>>(new Set());
  const [regFilter, setRegFilter] = useState<Set<string>>(new Set());

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
    } else if (r.new_lanes?.length) {
      setLanes((prev) => {
        const byId = new Map(prev.map((l) => [l.id, l]));
        r.new_lanes!.forEach((l) => byId.set(l.id, l));
        return Array.from(byId.values());
      });
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

  async function downloadReroutePdf() {
    if (!rerouteBanner) return;
    const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const droppedLanes = rerouteBanner.lanes_to_drop ?? [];
    const addedLanes = rerouteBanner.new_lanes ?? [];

    const fmtLane = (l: TradeLane) =>
      `• ${l.id}  ${l.origin_region} → ${l.dest_region}  ${l.mode}  ` +
      `transit ${l.transit_days ?? "?"}d` +
      (l.regulations?.length ? `  reg: ${l.regulations.join(",")}` : "");

    const sections = [
      {
        badge: "이벤트", title: rerouteBanner.event,
        body: rerouteBanner.message ?? "(no message)",
        accentColor: "#f59e0b",
      },
    ];
    if (droppedLanes.length > 0) {
      sections.push({
        badge: "차단", title: `${droppedLanes.length}개 lane 제외`,
        body: droppedLanes.map(fmtLane).join("\n"),
        accentColor: "#ef4444",
      });
    }
    if (addedLanes.length > 0) {
      sections.push({
        badge: "신규", title: `${addedLanes.length}개 대체 lane`,
        body: addedLanes.map(fmtLane).join("\n"),
        accentColor: "#10b981",
      });
    }
    sections.push({
      badge: "현재 상태",
      title: `Lane ${lanes.length}개 · 모드 ${new Set(lanes.map((l) => l.mode)).size}종`,
      body:
        `총 lane: ${lanes.length}\n` +
        `차단된 lane id: ${droppedIds.join(", ") || "—"}\n` +
        `신규 lane id: ${addedIds.join(", ") || "—"}`,
      accentColor: "#3b82f6",
    });

    await exportToPdf({
      title: `SCM Reroute — ${rerouteBanner.event}`,
      subtitle: rerouteBanner.message,
      meta: `차단 ${droppedLanes.length}건 · 신규 ${addedLanes.length}건 · 추출 ${stamp}`,
      sections,
      footer: `Ontology MFG · 글로벌 SCM lane 시뮬 · 합성 데이터 · 생성: ${stamp}`,
      filename: `lane-reroute-${rerouteBanner.event.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
    });
  }

  function toggleMode(m: string) {
    setModeFilter((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  }
  function toggleReg(r: string) {
    setRegFilter((prev) => {
      const next = new Set(prev);
      next.has(r) ? next.delete(r) : next.add(r);
      return next;
    });
  }

  // ── KPIs derived from lanes ────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = lanes.length;
    const flagged = lanes.filter((l) => (l.regulations ?? []).length > 0).length;
    const avgTransit = lanes.length
      ? Math.round(lanes.reduce((s, l) => s + (l.transit_days ?? 0), 0) / lanes.length)
      : 0;
    const destCounts = new Map<string, number>();
    lanes.forEach((l) => destCounts.set(l.dest_region, (destCounts.get(l.dest_region) ?? 0) + 1));
    const topDest = [...destCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const modes = new Set(lanes.map((l) => l.mode)).size;
    const status = droppedIds.length || addedIds.length ? "REROUTE" : "STABLE";
    return { total, flagged, avgTransit, topDest, modes, status };
  }, [lanes, droppedIds, addedIds]);

  // ── By-destination bar data ────────────────────────────────────────────
  const destBars = useMemo(() => {
    const m = new Map<string, number>();
    lanes.forEach((l) => m.set(l.dest_region, (m.get(l.dest_region) ?? 0) + 1));
    const rows = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const max = rows[0]?.[1] ?? 1;
    return rows.map(([code, n]) => ({ code, n, pct: (n / max) * 100 }));
  }, [lanes]);

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader
        scenario="H"
        title="글로벌 SCM Lane"
        tech="Cypher TradeLane + IRA/USMCA/CBAM 규제 매핑 → reroute 시뮬 + CBAM 부담액 환산"
      />

      {/* ═══ Reroute banner ═══ */}
      {rerouteBanner && (
        <div className="border-b border-orange-500/40 bg-orange-500/10 px-6 py-2 flex items-center gap-3">
          <Zap className="w-4 h-4 text-orange-300 shrink-0" />
          <div className="text-xs text-orange-100 flex-1 min-w-0">
            <span className="font-bold mr-2">{rerouteBanner.event}</span>
            <span className="text-orange-200/90">{rerouteBanner.message}</span>
            {rerouteBanner.lanes_to_drop && (
              <span className="ml-3 text-red-300">
                ✕ {rerouteBanner.lanes_to_drop.length}개 lane 차단
              </span>
            )}
            {rerouteBanner.new_lanes && rerouteBanner.new_lanes.length > 0 && (
              <span className="ml-2 text-emerald-300">
                + {rerouteBanner.new_lanes.length}개 lane 신규
              </span>
            )}
          </div>
          <button
            onClick={downloadReroutePdf}
            className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded border border-orange-400/40 text-orange-200 hover:bg-orange-500/15"
            title="Reroute 결과를 PDF로 다운로드"
          >
            <FileDown className="w-3 h-3" /> PDF
          </button>
          <button
            onClick={clearReroute}
            className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded border border-orange-400/40 text-orange-200 hover:bg-orange-500/15"
          >
            <RotateCcw className="w-3 h-3" /> RESET
          </button>
          <button onClick={clearReroute} className="text-orange-300 hover:text-orange-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ═══ KPI strip ═══ */}
      <div className="border-b border-ink-700 bg-ink-900/70 px-6 py-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Kpi label="Total Lanes" value={kpis.total} />
        <Kpi label="Flagged"     value={kpis.flagged}    sub={`${Math.round((kpis.flagged / Math.max(1, kpis.total)) * 100)}% 규제 노출`} tone={kpis.flagged > 0 ? "amber" : "default"} />
        <Kpi label="Avg Transit" value={`${kpis.avgTransit}일`} />
        <Kpi label="Top Dest"    value={kpis.topDest ? `${REGION_LABEL_SHORT[kpis.topDest[0]] ?? kpis.topDest[0]}` : "—"} sub={kpis.topDest ? `${kpis.topDest[1]} lanes` : ""} />
        <Kpi label="Modes"       value={kpis.modes} />
        <Kpi label="Status"      value={kpis.status} tone={kpis.status === "REROUTE" ? "rose" : "emerald"} />
      </div>

      {/* ═══ Main grid: map + right panel ═══ */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-0">
        {/* ─── Map ─── */}
        <div className="p-4 min-h-[500px]">
          {loading ? (
            <div className="h-full flex items-center justify-center text-ink-500 text-sm">
              Lane 데이터 로딩 중...
            </div>
          ) : (
            <SCMMap
              lanes={
                lanes.filter((l) => {
                  if (modeFilter.size > 0 && !modeFilter.has(l.mode)) return false;
                  if (regFilter.size > 0 && !(l.regulations ?? []).some((r) => regFilter.has(r))) {
                    return false;
                  }
                  return true;
                })
              }
              droppedIds={droppedIds}
              addedIds={addedIds}
            />
          )}
        </div>

        {/* ─── Right control panel ─── */}
        <aside className="border-l border-ink-700 bg-ink-900 p-4 space-y-5 overflow-y-auto">
          {/* Reroute simulator */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2 flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Reroute Simulator
            </div>
            <div className="space-y-1.5">
              <RerouteBtn label="IRA 2026 발효" tone="rose"     onClick={() => triggerReroute("IRA_2026")} />
              <RerouteBtn label="USMCA 2025 갱신" tone="emerald" onClick={() => triggerReroute("USMCA_2025")} />
              <RerouteBtn label="CBAM 2026 발효" tone="amber"    onClick={() => triggerReroute("CBAM_2026")} />
            </div>
          </section>

          {/* Filters */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2 flex items-center gap-1.5">
              <Filter className="w-3 h-3" /> Mode Filter
            </div>
            <div className="flex flex-wrap gap-1">
              {MODES.map((m) => (
                <FilterChip key={m} active={modeFilter.has(m)} tone={MODE_TONE[m]} onClick={() => toggleMode(m)}>
                  {m}
                </FilterChip>
              ))}
              {modeFilter.size > 0 && (
                <button onClick={() => setModeFilter(new Set())} className="text-[10px] text-ink-500 hover:text-ink-200 px-1.5">초기화</button>
              )}
            </div>
          </section>

          <section>
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> Regulation Filter
            </div>
            <div className="flex flex-wrap gap-1">
              {REGS.map((r) => (
                <FilterChip key={r} active={regFilter.has(r)} tone={REG_TONE[r]} onClick={() => toggleReg(r)}>
                  {r}
                </FilterChip>
              ))}
              {regFilter.size > 0 && (
                <button onClick={() => setRegFilter(new Set())} className="text-[10px] text-ink-500 hover:text-ink-200 px-1.5">초기화</button>
              )}
            </div>
          </section>

          {/* By-destination bars */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2 flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> By Destination
            </div>
            <div className="space-y-1">
              {destBars.map((b) => (
                <div key={b.code} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-ink-300 w-12 shrink-0">
                    {REGION_LABEL_SHORT[b.code] ?? b.code}
                  </span>
                  <div className="relative flex-1 h-3 bg-ink-800 rounded overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-accent-500/70" style={{ width: `${b.pct}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-ink-400 w-7 text-right">{b.n}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Reroute detail */}
          {(droppedIds.length > 0 || addedIds.length > 0) && (
            <section className="border-t border-ink-700 pt-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">
                Reroute Detail
              </div>
              {rerouteBanner?.lanes_to_drop && rerouteBanner.lanes_to_drop.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] text-red-300 mb-1 font-medium">DROPPED ({rerouteBanner.lanes_to_drop.length})</div>
                  <ul className="space-y-0.5">
                    {rerouteBanner.lanes_to_drop.map((l) => (
                      <li key={l.id} className="text-[11px] font-mono text-red-200/80 truncate">
                        {REGION_LABEL_SHORT[l.origin_region] ?? l.origin_region} → {REGION_LABEL_SHORT[l.dest_region] ?? l.dest_region}
                        <span className="text-ink-500 ml-1.5">({l.mode})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {rerouteBanner?.new_lanes && rerouteBanner.new_lanes.length > 0 && (
                <div>
                  <div className="text-[10px] text-emerald-300 mb-1 font-medium">ADDED ({rerouteBanner.new_lanes.length})</div>
                  <ul className="space-y-0.5">
                    {rerouteBanner.new_lanes.map((l) => (
                      <li key={l.id} className="text-[11px] font-mono text-emerald-200/80 truncate">
                        {REGION_LABEL_SHORT[l.origin_region] ?? l.origin_region} → {REGION_LABEL_SHORT[l.dest_region] ?? l.dest_region}
                        <span className="text-ink-500 ml-1.5">({l.mode}·{l.transit_days}일)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Small components ──────────────────────────────────────────────────────

function Kpi({ label, value, sub, tone = "default" }: {
  label: string; value: string | number; sub?: string;
  tone?: "default" | "amber" | "rose" | "emerald";
}) {
  const toneClass = {
    default: "text-ink-100",
    amber:   "text-amber-200",
    rose:    "text-rose-200",
    emerald: "text-emerald-200",
  }[tone];
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-ink-500 font-semibold">{label}</div>
      <div className={`text-lg font-bold font-mono ${toneClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-ink-500 -mt-0.5">{sub}</div>}
    </div>
  );
}

function RerouteBtn({ label, tone, onClick }: { label: string; tone: "rose" | "emerald" | "amber"; onClick: () => void }) {
  const cls = {
    rose:    "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
    amber:   "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
  }[tone];
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 border rounded-md px-2.5 py-1.5 text-xs font-medium transition ${cls}`}
    >
      <span>{label}</span>
      <Zap className="w-3 h-3" />
    </button>
  );
}

function FilterChip({ children, active, tone, onClick }: {
  children: React.ReactNode; active: boolean; tone?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "text-[10px] font-mono px-2 py-1 rounded border transition",
        active ? (tone ?? "border-accent-500 bg-accent-500/20 text-accent-100") : "border-ink-700 bg-ink-800 text-ink-400 hover:border-ink-500",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
