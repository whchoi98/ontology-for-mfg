// web/components/SCMMap.tsx
"use client";
import { ComposableMap, Geographies, Geography, Line, Marker } from "react-simple-maps";
import type { TradeLane } from "@/lib/types";

const REGION_COORDS: Record<string, [number, number]> = {
  KR: [127.5, 36.5], CN: [104.1, 35.8], VN: [108.3, 14.0],
  MX: [-102.5, 23.6], PL: [19.1, 51.9], US: [-95.7, 37.0], IN: [78.9, 20.6],
};

interface SCMMapProps {
  lanes: TradeLane[];
  droppedIds?: string[];
  addedIds?: string[];
}

export function SCMMap({ lanes, droppedIds = [], addedIds = [] }: SCMMapProps) {
  const flag = (regs: string[]) => regs.includes("IRA-30D") ? "#ef4444"
    : regs.includes("USMCA-Auto75") ? "#10b981"
    : regs.includes("CBAM") ? "#f59e0b" : "#6b7280";

  return (
    <div className="border border-ink-700 rounded-lg bg-ink-950 overflow-hidden">
      <ComposableMap projection="geoMercator" projectionConfig={{ scale: 110 }} width={800} height={400}>
        <Geographies geography="https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json">
          {({ geographies }) => geographies.map((geo) => (
            <Geography key={geo.rsmKey} geography={geo} fill="#1e293b" stroke="#334155" strokeWidth={0.5} />
          ))}
        </Geographies>

        {/* Normal lanes rendered first (below highlights) */}
        {lanes
          .filter((l) => !droppedIds.includes(l.id) && !addedIds.includes(l.id))
          .map((l) => {
            const o = REGION_COORDS[l.origin_region];
            const d = REGION_COORDS[l.dest_region];
            if (!o || !d) return null;
            return (
              <Line
                key={l.id}
                from={o}
                to={d}
                stroke={flag(l.regulations)}
                strokeWidth={1.2}
                strokeOpacity={0.7}
              />
            );
          })}

        {/* Dropped lanes — dashed red, reduced opacity */}
        {lanes
          .filter((l) => droppedIds.includes(l.id))
          .map((l) => {
            const o = REGION_COORDS[l.origin_region];
            const d = REGION_COORDS[l.dest_region];
            if (!o || !d) return null;
            return (
              <Line
                key={`drop-${l.id}`}
                from={o}
                to={d}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeOpacity={0.4}
                strokeDasharray="4 3"
              />
            );
          })}

        {/* Added lanes — thick green solid */}
        {lanes
          .filter((l) => addedIds.includes(l.id))
          .map((l) => {
            const o = REGION_COORDS[l.origin_region];
            const d = REGION_COORDS[l.dest_region];
            if (!o || !d) return null;
            // Midpoint for "NEW" label
            const mx = (o[0] + d[0]) / 2;
            const my = (o[1] + d[1]) / 2 - 3;
            return (
              <g key={`add-${l.id}`}>
                <Line
                  from={o}
                  to={d}
                  stroke="#10b981"
                  strokeWidth={3}
                  strokeOpacity={0.9}
                />
                <Marker coordinates={[mx, my]}>
                  <rect x={-10} y={-7} width={20} height={10} rx={3} fill="#10b981" opacity={0.9} />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fontSize: 6, fill: "#fff", fontWeight: "bold" }}
                  >
                    NEW
                  </text>
                </Marker>
              </g>
            );
          })}

        {/* Country markers */}
        {Object.entries(REGION_COORDS).map(([r, c]) => (
          <Marker key={r} coordinates={c}>
            <circle r={4} fill="#3b82f6" stroke="#1d4ed8" strokeWidth={1} />
            <text x={6} y={3} fontSize={9} fill="#93c5fd" fontWeight="bold">{r}</text>
          </Marker>
        ))}
      </ComposableMap>
    </div>
  );
}
