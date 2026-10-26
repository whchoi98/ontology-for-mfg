import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => function CytoscapeStub() { return <div data-testid="cy" />; },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    <a href={href} {...rest}>{children}</a>,
}));

import ObjectTypePage from "@/app/objects/[type]/page";

type Pending = { url: string; signal?: AbortSignal; resolve: (body: unknown) => void };

let pending: Pending[] = [];

/** Next 16 hands client pages their route params as a Promise (unwrapped
 *  with React `use()`), so the page suspends until it resolves. */
function page(type: string) {
  return (
    <Suspense fallback={null}>
      <ObjectTypePage params={Promise.resolve({ type })} />
    </Suspense>
  );
}

async function renderPage(type: string) {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(page(type)); });
  return view;
}

function detail(id: string, name: string) {
  return {
    type: "Component", label: "Component", id, name,
    properties: { id }, subgraph: { nodes: [], edges: [] }, neighbor_summary: {},
  };
}

/** Deferred fetch: responses are released by the test, IGNORING abort — so a
 *  late server response must be dropped by the page itself. */
function deferredFetch() {
  return vi.fn((url: string, init?: RequestInit) => new Promise<Response>((resolve) => {
    pending.push({
      url, signal: init?.signal ?? undefined,
      resolve: (body) => resolve(new Response(JSON.stringify(body), { status: 200 })),
    });
  }));
}

async function release(match: (u: string) => boolean, body: unknown) {
  const p = pending.find((x) => match(x.url));
  if (!p) throw new Error(`no pending fetch matching; have ${pending.map((x) => x.url).join(", ")}`);
  pending = pending.filter((x) => x !== p);
  await act(async () => { p.resolve(body); });
  return p;
}

beforeEach(() => {
  pending = [];
  vi.stubGlobal("fetch", deferredFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("objects/[type] explorer", () => {
  it("drops a stale detail response when the user picks another item mid-flight", async () => {
    await renderPage("Component");
    await release((u) => u.endsWith("/api/objects/Component?limit=100"), {
      type: "Component", label: "Component", total: 2,
      items: [{ id: "A", name: "Alpha" }, { id: "B", name: "Beta" }],
    });

    // First item auto-selected → detail(A) in flight. User clicks Beta.
    expect(pending.some((p) => p.url.endsWith("/api/objects/Component/A"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Beta/ }));

    // A's response arrives late: must neither render nor clear B's loading state.
    const a = await release((u) => u.endsWith("/api/objects/Component/A"), detail("A", "Alpha detail"));
    expect(a.signal?.aborted).toBe(true);
    expect(screen.queryByText("Alpha detail")).toBeNull();
    expect(screen.getByText("그래프 로딩 중…")).toBeTruthy();

    await release((u) => u.endsWith("/api/objects/Component/B"), detail("B", "Beta detail"));
    expect(screen.getAllByText("Beta detail").length).toBeGreaterThan(0);
    expect(screen.queryByText("그래프 로딩 중…")).toBeNull();
  });

  it("drops a stale list response after navigating to another type", async () => {
    const view = await renderPage("Component");
    await act(async () => { view.rerender(page("Supplier")); });

    await release((u) => u.endsWith("/api/objects/Supplier?limit=100"), {
      type: "Supplier", label: "Supplier", total: 1, items: [{ id: "S1", name: "Supplier One" }],
    });
    await release((u) => u.endsWith("/api/objects/Component?limit=100"), {
      type: "Component", label: "Component", total: 1, items: [{ id: "C1", name: "Component One" }],
    });
    expect(screen.getByRole("button", { name: /Supplier One/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Component One/ })).toBeNull();
  });
});
