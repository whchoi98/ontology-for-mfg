// web/components/CytoscapeView.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import cytoscape, { ElementsDefinition, NodeSingular } from "cytoscape";
import { X } from "lucide-react";
import type { CytoscapeGraph } from "@/lib/types";

export function CytoscapeView({ graph }: { graph: CytoscapeGraph }) {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<{ id: string; data: Record<string, unknown> } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const elements: ElementsDefinition = {
      nodes: graph.nodes as ElementsDefinition["nodes"],
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
            label: "data(label)",
            "font-size": "10px",
            color: "#cbd5e1",
            "text-valign": "bottom",
            "text-margin-y": 4,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": "#475569",
            "target-arrow-color": "#475569",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
          },
        },
        { selector: 'node[label = "Component"]', style: { "background-color": "#10b981" } },
        { selector: 'node[label = "Supplier"]',  style: { "background-color": "#f59e0b" } },
        { selector: 'node[label = "Plant"]',     style: { "background-color": "#ef4444" } },
        { selector: 'node[label = "Standard"]',  style: { "background-color": "#a855f7" } },
        { selector: 'node[label = "TradeLane"]', style: { "background-color": "#0ea5e9" } },
        {
          selector: "node:selected",
          style: { "border-width": 3, "border-color": "#ff6b35", "border-opacity": 1 },
        },
      ],
      layout: { name: "concentric", animate: false },
    });

    cy.on("tap", "node", (evt) => {
      const node = evt.target as NodeSingular;
      const data = node.data() as Record<string, unknown>;
      setSelected({ id: String(data.id ?? ""), data });
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) setSelected(null);
    });

    return () => cy.destroy();
  }, [graph]);

  return (
    <div className="relative">
      <div ref={ref} className="w-full h-[400px] border border-ink-700 rounded-lg bg-ink-950" />

      {selected && (
        <div className="absolute top-2 right-2 w-72 bg-ink-900 border border-ink-700 rounded-lg shadow-xl p-4 z-10">
          <div className="flex items-start justify-between mb-2">
            <h4 className="text-sm font-semibold text-accent-300">
              {String(selected.data.label ?? "Node")}
            </h4>
            <button
              onClick={() => setSelected(null)}
              className="text-ink-400 hover:text-ink-200 transition ml-2 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs font-mono text-ink-400 mb-3 break-all">
            {selected.id}
          </div>
          <dl className="space-y-1.5 text-xs">
            {Object.entries(selected.data)
              .filter(([k]) => !["id", "label"].includes(k))
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
          {Object.keys(selected.data).filter((k) => !["id", "label"].includes(k)).length === 0 && (
            <div className="text-xs text-ink-500 italic">속성 없음</div>
          )}
        </div>
      )}
    </div>
  );
}
