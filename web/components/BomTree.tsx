// web/components/BomTree.tsx
"use client";
import { useState } from "react";

interface BomNode { id: string; name: string; level: "Product"|"Module"|"Component"|"RawMaterial"; children?: BomNode[] }

function Row({ node, depth }: { node: BomNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = (node.children?.length ?? 0) > 0;
  return (
    <div>
      <div className="flex items-center text-sm py-1" style={{ paddingLeft: depth * 16 }}>
        {hasChildren ? (
          <button className="w-4 text-neutral-500" onClick={() => setOpen(!open)}>{open ? "▼" : "▶"}</button>
        ) : <span className="w-4" />}
        <span className="px-2 py-0.5 rounded text-xs bg-neutral-100 mr-2">{node.level}</span>
        <span>{node.name}</span>
        <span className="ml-2 text-xs text-neutral-400">{node.id}</span>
      </div>
      {open && hasChildren && node.children!.map((c) => <Row key={c.id} node={c} depth={depth + 1} />)}
    </div>
  );
}

export function BomTree({ root }: { root: BomNode }) {
  return <div className="border rounded-lg bg-white p-2"><Row node={root} depth={0} /></div>;
}
