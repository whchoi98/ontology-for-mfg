import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { CytoscapeGraph } from "@/lib/types";

type Handler = (evt: { target: unknown }) => void;

const h = vi.hoisted(() => {
  const state = {
    created: 0,
    destroyed: 0,
    anchored: [] as string[],
    unanchored: [] as string[],
    nodeTap: null as null | ((evt: { target: unknown }) => void),
  };
  function factory() {
    state.created += 1;
    const core = {
      ready: (cb: () => void) => cb(),
      fit: () => {},
      zoom: () => 1,
      center: () => {},
      on: (ev: string, selOrCb: string | Handler, cb?: Handler) => {
        if (ev === "tap" && selOrCb === "node" && cb) state.nodeTap = cb;
      },
      getElementById: (id: string) => ({
        length: 1,
        addClass: () => { state.anchored.push(id); },
      }),
      nodes: () => ({ removeClass: () => { state.unanchored.push("*"); } }),
      destroy: () => { state.destroyed += 1; },
    };
    return core;
  }
  return { state, factory };
});

vi.mock("cytoscape", () => ({ default: h.factory }));

import { CytoscapeView } from "@/components/CytoscapeView";

const GRAPH: CytoscapeGraph = {
  nodes: [{ data: { id: "A", label: "Component" } }, { data: { id: "B", label: "Supplier" } }],
  edges: [{ data: { id: "e1", source: "A", target: "B", type: "SUPPLIED_BY" } }],
};

beforeEach(() => {
  h.state.created = 0;
  h.state.destroyed = 0;
  h.state.anchored = [];
  h.state.unanchored = [];
  h.state.nodeTap = null;
});

describe("CytoscapeView", () => {
  it("does not recreate the graph on parent re-renders with the default anchorIds", () => {
    const { rerender } = render(<CytoscapeView graph={GRAPH} />);
    rerender(<CytoscapeView graph={GRAPH} />);
    rerender(<CytoscapeView graph={GRAPH} />);
    expect(h.state.created).toBe(1);
    expect(h.state.destroyed).toBe(0);
  });

  it("does not recreate the graph when an inline anchorIds array keeps the same ids", () => {
    const { rerender } = render(<CytoscapeView graph={GRAPH} anchorIds={["A"]} />);
    rerender(<CytoscapeView graph={GRAPH} anchorIds={["A"]} />);
    expect(h.state.created).toBe(1);
    expect(h.state.anchored).toContain("A");
  });

  it("does not recreate the graph when a node is tapped (inspector state update)", () => {
    render(<CytoscapeView graph={GRAPH} />);
    const node = { data: () => ({ id: "B", label: "Supplier" }) };
    act(() => { h.state.nodeTap?.({ target: node }); });
    expect(h.state.created).toBe(1);
  });

  it("re-anchors without rebuilding when only anchorIds change", () => {
    const { rerender } = render(<CytoscapeView graph={GRAPH} anchorIds={["A"]} />);
    rerender(<CytoscapeView graph={GRAPH} anchorIds={["B"]} />);
    expect(h.state.created).toBe(1);
    expect(h.state.anchored).toContain("B");
  });

  it("rebuilds when the graph itself changes, and destroys on unmount", () => {
    const { rerender, unmount } = render(<CytoscapeView graph={GRAPH} />);
    rerender(<CytoscapeView graph={{ ...GRAPH }} />);
    expect(h.state.created).toBe(2);
    expect(h.state.destroyed).toBe(1);
    unmount();
    expect(h.state.destroyed).toBe(2);
  });
});
