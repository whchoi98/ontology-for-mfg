// web/components/CytoscapeView.tsx
"use client";
import { useEffect, useRef } from "react";
import cytoscape, { ElementsDefinition } from "cytoscape";
import type { CytoscapeGraph } from "@/lib/types";

export function CytoscapeView({ graph }: { graph: CytoscapeGraph }) {
  const ref = useRef<HTMLDivElement>(null);
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
        { selector: "node", style: { "background-color": "#3b82f6", label: "data(label)", "font-size": "10px" } },
        { selector: "edge", style: { width: 1, "line-color": "#9ca3af", "target-arrow-color": "#9ca3af",
                                       "target-arrow-shape": "triangle", "curve-style": "bezier" } },
        { selector: 'node[label = "Component"]', style: { "background-color": "#10b981" } },
        { selector: 'node[label = "Supplier"]',  style: { "background-color": "#f59e0b" } },
        { selector: 'node[label = "Plant"]',     style: { "background-color": "#ef4444" } },
      ],
      layout: { name: "concentric", animate: false },
    });
    return () => cy.destroy();
  }, [graph]);
  return <div ref={ref} className="w-full h-[400px] border rounded-lg bg-white" />;
}
