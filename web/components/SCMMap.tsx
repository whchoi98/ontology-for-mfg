// web/components/SCMMap.tsx
"use client";
import { ComposableMap, Geographies, Geography, Line, Marker } from "react-simple-maps";
import type { TradeLane } from "@/lib/types";

const REGION_COORDS: Record<string, [number, number]> = {
  KR: [127.5, 36.5], CN: [104.1, 35.8], VN: [108.3, 14.0],
  MX: [-102.5, 23.6], PL: [19.1, 51.9], US: [-95.7, 37.0], IN: [78.9, 20.6],
};

export function SCMMap({ lanes }: { lanes: TradeLane[] }) {
  const flag = (regs: string[]) => regs.includes("IRA-30D") ? "#ef4444"
    : regs.includes("USMCA-Auto75") ? "#10b981"
    : regs.includes("CBAM") ? "#f59e0b" : "#6b7280";
  return (
    <div className="border rounded-lg bg-white">
      <ComposableMap projection="geoMercator" projectionConfig={{ scale: 110 }} width={800} height={400}>
        <Geographies geography="https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json">
          {({ geographies }) => geographies.map((geo) => (
            <Geography key={geo.rsmKey} geography={geo} fill="#f3f4f6" stroke="#e5e7eb" />
          ))}
        </Geographies>
        {lanes.map((l) => {
          const o = REGION_COORDS[l.origin_region];
          const d = REGION_COORDS[l.dest_region];
          if (!o || !d) return null;
          return <Line key={l.id} from={o} to={d} stroke={flag(l.regulations)} strokeWidth={1.2} />;
        })}
        {Object.entries(REGION_COORDS).map(([r, c]) => (
          <Marker key={r} coordinates={c}>
            <circle r={4} fill="#1e3a8a" />
            <text x={6} y={3} fontSize={9} fill="#1e3a8a">{r}</text>
          </Marker>
        ))}
      </ComposableMap>
      <div className="flex gap-4 px-3 py-2 text-xs">
        <span><span className="inline-block w-3 h-1 bg-red-500 mr-1" />IRA-30D</span>
        <span><span className="inline-block w-3 h-1 bg-emerald-500 mr-1" />USMCA</span>
        <span><span className="inline-block w-3 h-1 bg-amber-500 mr-1" />CBAM</span>
        <span><span className="inline-block w-3 h-1 bg-neutral-500 mr-1" />normal</span>
      </div>
    </div>
  );
}
