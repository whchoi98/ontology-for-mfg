import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PersonaProvider } from "@/lib/persona-context";

const h = vi.hoisted(() => ({
  api: { compliance: vi.fn(), price: vi.fn(), priceSamples: vi.fn() },
}));

vi.mock("@/lib/api-client", () => ({ api: h.api }));
vi.mock("next/dynamic", () => ({
  default: () => function CytoscapeStub() { return <div data-testid="cy" />; },
}));

import CompliancePage from "@/app/compliance/page";
import PricePage from "@/app/price/page";

const WAIT = { timeout: 3000 };

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  localStorage.clear();
});

function renderWithPersona(ui: React.ReactElement) {
  return render(<PersonaProvider>{ui}</PersonaProvider>);
}

async function checkCompliance(body: unknown) {
  h.api.compliance.mockResolvedValue(body);
  renderWithPersona(<CompliancePage />);
  fireEvent.change(screen.getByPlaceholderText("예: AMZN-CMP-IC-00001"), { target: { value: "AMZN-CMP-IC-00099" } });
  fireEvent.click(screen.getByRole("button", { name: "검사" }));
}

describe("compliance — status rendering (E)", () => {
  it("renders insufficient_data explicitly instead of falling back to the empty state", async () => {
    await checkCompliance({
      status: "insufficient_data", compliant: null, violations: [],
      component_id: "AMZN-CMP-IC-00099",
      message: "부품의 물질(CAS) 선언 데이터가 없어 판정할 수 없습니다 (데이터 없음 ≠ 적합).",
      component: { id: "AMZN-CMP-IC-00099", name: "IC 부품 00099", substances: [], standards: [] },
      _synthetic: false,
    });
    expect(await screen.findByText(/판정 불가/, {}, WAIT)).toBeTruthy();
    expect(screen.getByText(/데이터 없음 ≠ 적합/)).toBeTruthy();
    expect(screen.getByText(/IC 부품 00099/)).toBeTruthy();
    // Not a pass, not a fail, and not the initial sample-chip state.
    expect(screen.queryByText("적합 (Compliant)")).toBeNull();
    expect(screen.queryByText("부적합 (Non-Compliant)")).toBeNull();
    expect(screen.queryByText(/추천 질문/)).toBeNull();
  });

  it("treats compliant:null without a status (older API) as insufficient_data, with a default message", async () => {
    await checkCompliance({ compliant: null, violations: [] });
    expect(await screen.findByText(/판정 불가/, {}, WAIT)).toBeTruthy();
    expect(screen.getByText(/물질\(CAS\) 선언 데이터가 없어/)).toBeTruthy();
    expect(screen.queryByText(/추천 질문/)).toBeNull();
  });

  it("renders engine-shaped violations (regulation · substance + severity)", async () => {
    await checkCompliance({
      status: "non_compliant", compliant: false, component_id: "X",
      violations: [
        { regulation: "RoHS", substance: "7439-92-1", severity: "HIGH" },
        { regulation: "REACH-SVHC", substance: "117-81-7", severity: "MID" },
      ],
    });
    expect(await screen.findByText("부적합 (Non-Compliant)", {}, WAIT)).toBeTruthy();
    expect(screen.getByText("위반 사항 (2건)")).toBeTruthy();
    expect(screen.getByText("RoHS · 7439-92-1")).toBeTruthy();
    expect(screen.getByText("REACH-SVHC · 117-81-7")).toBeTruthy();
    expect(screen.getByText("HIGH")).toBeTruthy();
  });

  it("renders compliant", async () => {
    await checkCompliance({ status: "compliant", compliant: true, violations: [], component_id: "X" });
    expect(await screen.findByText("적합 (Compliant)", {}, WAIT)).toBeTruthy();
    expect(screen.queryByText(/판정 불가/)).toBeNull();
  });
});

function priceResponse(offers: unknown[], summary: Record<string, unknown>) {
  return {
    original: {
      id: "AMZN-CMP-IC-00001", name: "IC 부품 00001", category: "IC",
      current_supplier: "Alpha Corp", current_unit_price_usd: null, monthly_demand_units: 12000,
    },
    offers,
    subgraph: { nodes: [], edges: [] },
    summary: {
      supplier_count: offers.length, min_leadtime_days: 0, max_leadtime_days: 0,
      min_unit_price_usd: 0, max_unit_price_usd: 0, avg_otd: 0,
      best_supplier_id: "S2", best_supplier_name: "Beta Corp",
      ...summary,
    },
    _synthetic: false,
  };
}

async function openPrice(body: unknown) {
  h.api.priceSamples.mockResolvedValue({ items: [] });
  h.api.price.mockResolvedValue(body);
  renderWithPersona(<PricePage />);
  fireEvent.click(screen.getByRole("button", { name: /AMZN-CMP-IC-00001 4 협력사/ }));
  expect(await screen.findByText("IC 부품 00001", {}, WAIT)).toBeTruthy();
}

describe("price — real SUPPLIED_BY rows with missing metrics (G)", () => {
  it("renders rows lacking stock / defect / delta and null price / lead time without crashing", async () => {
    await openPrice(priceResponse([
      // Real Neptune row: only the SUPPLIED_BY edge props, all null here.
      { supplier_id: "S1", supplier_name: "Alpha Corp", region: "KR",
        leadtime_days: null, otd: null, unit_price_usd: null, moq: null, composite_score: 50 },
      { supplier_id: "S2", supplier_name: "Beta Corp", region: null,
        leadtime_days: 12, otd: 0.97, unit_price_usd: 1.5, moq: 1000, composite_score: 80 },
    ], {
      price_available: true, leadtime_available: true,
      min_leadtime_days: 12, max_leadtime_days: 12, min_unit_price_usd: 1.5, max_unit_price_usd: 1.5, avg_otd: 0.97,
    }));

    expect(screen.getAllByText("Alpha Corp").length).toBeGreaterThan(0);
    const beta = screen.getByText("S2").closest("tr")!;
    expect(beta.textContent).toContain("$1.50");
    expect(beta.textContent).toContain("1,000");
    expect(beta.textContent).toContain("12일");
    expect(beta.textContent).toContain("97.0%");
    const alpha = screen.getByText("S1").closest("tr")!;
    expect(alpha.textContent).not.toMatch(/undefined|NaN|null/);
    expect(alpha.textContent).toContain("—");
    expect(screen.getByText("$1.50 – $1.50")).toBeTruthy();
  });

  it("shows '정보 없음' when the summary says price / lead time are unavailable", async () => {
    await openPrice(priceResponse([
      { supplier_id: "S1", supplier_name: "Alpha Corp", region: "KR",
        leadtime_days: null, otd: null, unit_price_usd: null, moq: null, composite_score: 50 },
    ], { price_available: false, leadtime_available: false, best_supplier_id: "S1", best_supplier_name: "Alpha Corp" }));

    // price range, lead-time range and average OTD all lack data
    expect(screen.getAllByText("정보 없음")).toHaveLength(3);
    expect(screen.queryByText("$0.00 – $0.00")).toBeNull();
    expect(screen.queryByText("0 – 0일")).toBeNull();
  });

  it("falls back to scanning offers when the summary predates *_available", async () => {
    await openPrice(priceResponse([
      { supplier_id: "S2", supplier_name: "Beta Corp", region: "CN",
        leadtime_days: 9, otd: 0.9, unit_price_usd: 2, moq: 500, composite_score: 70,
        price_delta_pct: -3.5, stock_units: 4200, stock_status: "충분", defect_ppm: 120 },
    ], { min_leadtime_days: 9, max_leadtime_days: 9, min_unit_price_usd: 2, max_unit_price_usd: 2, avg_otd: 0.9 }));

    expect(screen.getByText("$2.00 – $2.00")).toBeTruthy();
    expect(screen.getByText("9 – 9일")).toBeTruthy();
    expect(screen.queryByText("정보 없음")).toBeNull();
    const row = screen.getByText("S2").closest("tr")!;
    expect(row.textContent).toContain("-3.5%");
    expect(row.textContent).toContain("4,200");
    expect(row.textContent).toContain("충분");
  });
});
