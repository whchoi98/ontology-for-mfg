import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PersonaProvider } from "@/lib/persona-context";

const h = vi.hoisted(() => ({
  api: {
    search: vi.fn(), insights: vi.fn(), specMatch: vi.fn(), compliance: vi.fn(),
    lanes: vi.fn(), reroute: vi.fn(), rfm: vi.fn(), esg: vi.fn(), pdm: vi.fn(),
  },
}));

vi.mock("@/lib/api-client", () => ({ api: h.api }));
vi.mock("@/components/CytoscapeView", () => ({ CytoscapeView: () => <div data-testid="cy" /> }));
vi.mock("@/components/SCMMap", () => ({ SCMMap: () => <div data-testid="map" /> }));

import SearchPage from "@/app/search/page";
import InsightsPage from "@/app/insights/page";
import SpecPage from "@/app/spec/page";
import RfmPage from "@/app/rfm/page";
import EsgPage from "@/app/esg/page";
import PdmPage from "@/app/pdm/page";
import CompliancePage from "@/app/compliance/page";
import LanePage from "@/app/lane/page";

const WAIT = { timeout: 3000 };
const boom = () => Promise.reject(new Error("/x → 503"));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function renderWithPersona(ui: React.ReactElement) {
  return render(<PersonaProvider>{ui}</PersonaProvider>);
}

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  localStorage.clear();
});

describe("W4 — failed requests release the loading state and show an error", () => {
  it("search", async () => {
    h.api.search.mockImplementation(boom);
    renderWithPersona(<SearchPage />);
    fireEvent.change(screen.getByPlaceholderText(/BGA 패키지/), { target: { value: "BGA" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(await screen.findByRole("alert", {}, WAIT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "검색" })).toBeTruthy();
  });

  it("insights", async () => {
    h.api.insights.mockImplementation(boom);
    renderWithPersona(<InsightsPage />);
    fireEvent.change(screen.getByPlaceholderText(/납기 준수율/), { target: { value: "OTD" } });
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    expect(await screen.findByRole("alert", {}, WAIT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "조회" })).toBeTruthy();
  });

  it("spec", async () => {
    h.api.specMatch.mockImplementation(boom);
    renderWithPersona(<SpecPage />);
    fireEvent.change(screen.getByPlaceholderText(/AEC-Q100 Grade 0/), { target: { value: "5V" } });
    fireEvent.click(screen.getByRole("button", { name: "매칭" }));
    expect(await screen.findByRole("alert", {}, WAIT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "매칭" })).toBeTruthy();
  });

  it("rfm", async () => {
    h.api.rfm.mockImplementation(boom);
    renderWithPersona(<RfmPage />);
    fireEvent.click(screen.getByRole("button", { name: "분석" }));
    expect(await screen.findByRole("alert", {}, WAIT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "분석" })).toBeTruthy();
  });

  it("esg", async () => {
    h.api.esg.mockImplementation(boom);
    renderWithPersona(<EsgPage />);
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    expect(await screen.findByRole("alert", {}, WAIT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "조회" })).toBeTruthy();
  });

  it("pdm", async () => {
    h.api.pdm.mockImplementation(boom);
    renderWithPersona(<PdmPage />);
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    expect(await screen.findByRole("alert", {}, WAIT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "조회" })).toBeTruthy();
  });

  it("compliance", async () => {
    h.api.compliance.mockImplementation(boom);
    renderWithPersona(<CompliancePage />);
    fireEvent.change(screen.getByPlaceholderText("예: AMZN-CMP-IC-00001"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "검사" }));
    expect(await screen.findByRole("alert", {}, WAIT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "검사" })).toBeTruthy();
  });

  it("lane — initial load and reroute", async () => {
    h.api.lanes.mockImplementation(boom);
    h.api.reroute.mockImplementation(boom);
    renderWithPersona(<LanePage />);
    expect(await screen.findByRole("alert", {}, WAIT)).toBeTruthy();
    expect(screen.queryByText("Lane 데이터 로딩 중...")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /IRA 2026 발효/ }));
    expect(await screen.findByText(/IRA_2026 재경로 계산 실패/, {}, WAIT)).toBeTruthy();
  });
});

describe("W5 — sample chips use their own persona; no overlapping submits", () => {
  it("search", async () => {
    const d = deferred<{ hits: unknown[]; subgraph: unknown }>();
    h.api.search.mockReturnValue(d.promise);
    renderWithPersona(<SearchPage />);
    fireEvent.click(screen.getByRole("button", { name: /차량용 -40°C 보장 BGA 패키지/ }));
    await waitFor(() => expect(h.api.search).toHaveBeenCalledTimes(1), WAIT);
    expect(h.api.search.mock.calls[0][1]).toBe("engineer");

    // Second submit while in flight is ignored.
    fireEvent.click(screen.getByRole("button", { name: "검색 중..." }));
    await new Promise((r) => setTimeout(r, 600));
    expect(h.api.search).toHaveBeenCalledTimes(1);

    d.resolve({ hits: [{ id: "C1", name: "BGA-1" }], subgraph: { nodes: [], edges: [] } });
    expect(await screen.findByText("BGA-1", {}, WAIT)).toBeTruthy();
  });

  it("insights", async () => {
    const d = deferred<Record<string, unknown>>();
    h.api.insights.mockReturnValue(d.promise);
    renderWithPersona(<InsightsPage />);
    fireEvent.click(screen.getByRole("button", { name: /Plant별 Scope/ }));
    await waitFor(() => expect(h.api.insights).toHaveBeenCalledTimes(1), WAIT);
    expect(h.api.insights.mock.calls[0][1]).toBe("scm");

    fireEvent.click(screen.getByRole("button", { name: "조회 중..." }));
    await new Promise((r) => setTimeout(r, 400));
    expect(h.api.insights).toHaveBeenCalledTimes(1);

    d.resolve({ summary: "Scope 3 비중이 가장 큼" });
    expect(await screen.findByText("Scope 3 비중이 가장 큼", {}, WAIT)).toBeTruthy();
  });
});
