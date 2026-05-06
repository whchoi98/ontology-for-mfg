// web/components/CytoscapeView.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import cytoscape, { ElementsDefinition, NodeSingular } from "cytoscape";
import { X } from "lucide-react";
import type { CytoscapeGraph } from "@/lib/types";

interface Props {
  graph: CytoscapeGraph;
  wowNodeIds?: string[];
  onNodeTap?: (nodeId: string, nodeLabel: string) => void;
  height?: number | string;
}

export function CytoscapeView({ graph, wowNodeIds = [], onNodeTap, height = "100%" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<{ id: string; data: Record<string, unknown> } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    // Preprocess nodes — ensure every node has `name_ko` populated for the label
    // (fallback chain: name_ko → name → title → id last 8 chars)
    const enrichedNodes = (graph.nodes ?? []).map((n) => {
      const d = (n.data ?? {}) as Record<string, unknown>;
      const id = String(d.id ?? "");
      const fallbackName =
        (d.name_ko as string) ||
        (d.name as string) ||
        (d.title as string) ||
        (id.length > 8 ? `${(d.label as string) || ""} ${id.slice(-8)}` : id);
      return { data: { ...d, name_ko: fallbackName } };
    });
    const elements: ElementsDefinition = {
      nodes: enrichedNodes as ElementsDefinition["nodes"],
      edges: graph.edges as ElementsDefinition["edges"],
    };
    const cy = cytoscape({
      container: ref.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#3b82f6",
            label: "data(name_ko)",
            "font-size": "11px",
            "text-wrap": "wrap",
            "text-max-width": "100",
            color: "#e2e8f0",
            "text-valign": "bottom",
            "text-margin-y": 4,
            width: 36,
            height: 36,
            "border-width": 2,
            "border-color": "#1e293b",
          },
        },
        {
          selector: "edge",
          style: {
            label: "data(type)",
            "font-size": "8px",
            color: "#64748b",
            width: 1,
            "line-color": "#475569",
            "target-arrow-color": "#475569",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "text-rotation": "autorotate",
          },
        },
        // Per-label color coding (BOM hierarchy + Supply + Standards + Quality + ESG)
        { selector: 'node[label = "Product"]',          style: { "background-color": "#60a5fa", shape: "round-rectangle" } },
        { selector: 'node[label = "Module"]',           style: { "background-color": "#34d399", shape: "round-rectangle" } },
        { selector: 'node[label = "Component"]',        style: { "background-color": "#fbbf24", shape: "ellipse" } },
        { selector: 'node[label = "RawMaterial"]',      style: { "background-color": "#a78bfa", shape: "ellipse" } },
        { selector: 'node[label = "Manufacturer"]',     style: { "background-color": "#f472b6", shape: "hexagon" } },
        { selector: 'node[label = "Supplier"]',         style: { "background-color": "#fb923c", shape: "diamond" } },
        { selector: 'node[label = "SubSupplier"]',      style: { "background-color": "#94a3b8", shape: "diamond" } },
        { selector: 'node[label = "CustomerAccount"]',  style: { "background-color": "#22d3ee", shape: "rectangle" } },
        { selector: 'node[label = "Plant"]',            style: { "background-color": "#0ea5e9", shape: "rectangle" } },
        { selector: 'node[label = "Region"]',           style: { "background-color": "#38bdf8", shape: "round-rectangle" } },
        { selector: 'node[label = "TradeLane"]',        style: { "background-color": "#14b8a6", shape: "octagon" } },
        { selector: 'node[label = "Standard"]',         style: { "background-color": "#facc15", shape: "tag" } },
        { selector: 'node[label = "Certification"]',    style: { "background-color": "#84cc16", shape: "tag" } },
        { selector: 'node[label = "Regulation"]',       style: { "background-color": "#f87171", shape: "pentagon" } },
        { selector: 'node[label = "Substance"]',        style: { "background-color": "#c084fc", shape: "ellipse" } },
        { selector: 'node[label = "QualityIncident"]',  style: { "background-color": "#fca5a5", shape: "diamond" } },
        { selector: 'node[label = "EightDReport"]',     style: { "background-color": "#fdba74", shape: "round-rectangle" } },
        { selector: 'node[label = "RootCause"]',        style: { "background-color": "#d9f99d", shape: "triangle" } },
        { selector: 'node[label = "Telemetry"]',        style: { "background-color": "#6ee7b7", shape: "ellipse" } },
        { selector: 'node[label = "MaintenanceEvent"]', style: { "background-color": "#93c5fd", shape: "round-rectangle" } },
        { selector: 'node[label = "ESGIndicator"]',     style: { "background-color": "#86efac", shape: "ellipse" } },
        { selector: 'node[label = "CarbonScope"]',      style: { "background-color": "#a5b4fc", shape: "octagon" } },
        // Wow highlighting (anchor node from list selection)
        {
          selector: "node.wow",
          style: {
            "border-color": "#ff6b35",
            "border-width": 4,
            width: 48,
            height: 48,
            "z-index": 10,
          },
        },
        {
          selector: "node:selected",
          style: { "border-width": 3, "border-color": "#fb923c", "border-opacity": 1 },
        },
      ],
      layout: { name: "concentric", animate: false, minNodeSpacing: 30 },
    });

    // Apply wow class to anchor nodes
    if (wowNodeIds.length > 0) {
      wowNodeIds.forEach((nid) => {
        const n = cy.getElementById(nid);
        if (n.length) n.addClass("wow");
      });
    }

    cy.on("tap", "node", (evt) => {
      const node = evt.target as NodeSingular;
      const data = node.data() as Record<string, unknown>;
      setSelected({ id: String(data.id ?? ""), data });
      if (onNodeTap) {
        onNodeTap(String(data.id ?? ""), String(data.label ?? ""));
      }
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) setSelected(null);
    });

    return () => cy.destroy();
  }, [graph, wowNodeIds, onNodeTap]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={ref}
        className="w-full border border-ink-700 rounded-lg bg-ink-950"
        style={{ height: typeof height === "number" ? `${height}px` : height, minHeight: 400 }}
      />
      {selected && (
        <div className="absolute top-2 right-2 w-72 bg-ink-900 border border-ink-700 rounded-lg shadow-xl p-4 z-10">
          <div className="flex items-start justify-between mb-2">
            <h4 className="text-sm font-semibold text-accent-300">
              {String(selected.data.label ?? "Node")}
            </h4>
            <button onClick={() => setSelected(null)} className="text-ink-400 hover:text-ink-200 transition ml-2 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs font-mono text-ink-400 mb-3 break-all">{selected.id}</div>
          <dl className="space-y-1.5 text-xs">
            {Object.entries(selected.data)
              .filter(([k]) => !["id", "label", "name_ko"].includes(k))
              .slice(0, 12)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-ink-400 shrink-0 font-medium">{k}:</dt>
                  <dd className="text-ink-200 truncate text-right">
                    {v == null ? "—" : String(v).slice(0, 60)}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </div>
  );
}
