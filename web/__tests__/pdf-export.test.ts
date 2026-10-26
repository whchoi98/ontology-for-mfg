import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Img = { y: number; h: number; page: number };

const h = vi.hoisted(() => ({
  rendered: [] as HTMLElement[],
  images: [] as { y: number; h: number; page: number }[],
  pages: 1,
  saved: [] as string[],
  failRender: false,
}));

// Fake html2canvas: canvas height comes from an `H=<px>` marker in the text,
// width is the block's raster width at scale 2 (696 px content × 2).
vi.mock("html2canvas", () => ({
  default: vi.fn(async (el: HTMLElement) => {
    if (h.failRender) throw new Error("canvas exceeds max size");
    h.rendered.push(el);
    const m = /H=(\d+)/.exec(el.textContent ?? "");
    const height = m ? Number(m[1]) : 200;
    return { width: 1392, height, toDataURL: () => "data:image/jpeg;base64,AAAA" };
  }),
}));

vi.mock("jspdf", () => ({
  default: class FakeJsPDF {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    addImage(_d: string, _f: string, _x: number, y: number, _w: number, hh: number) {
      h.images.push({ y, h: hh, page: h.pages });
    }
    addPage() { h.pages += 1; }
    save(name: string) { h.saved.push(name); }
  },
}));

import {
  MAX_CANVAS_AREA_PX, MAX_CANVAS_SIDE_PX, exportToPdf, planBlockLayout, safeRasterScale,
} from "@/lib/pdf-export";

const PAGE_H = 297;
const MARGIN = 28 * (210 / 760);
// 1392 px canvas ↔ (210 − 2·32·210/760) mm content width
const CONTENT_W = 210 - 2 * 32 * (210 / 760);
const pxToMm = (px: number) => (px * CONTENT_W) / 1392;

beforeEach(() => {
  h.rendered = [];
  h.images = [];
  h.pages = 1;
  h.saved = [];
  h.failRender = false;
  // jsdom has no 2D canvas; slicing only needs drawImage/fillRect/toDataURL.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage: () => {}, fillRect: () => {}, fillStyle: "" }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,BBBB");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("safeRasterScale", () => {
  it("keeps the preferred scale for normal blocks", () => {
    expect(safeRasterScale(696, 1200)).toBe(2);
    expect(safeRasterScale(0, 0)).toBe(2);
  });

  it("shrinks oversize blocks so the canvas stays inside browser limits", () => {
    for (const [w, hh] of [[696, 20_000], [696, 120_000], [100, 30_000]]) {
      const s = safeRasterScale(w, hh);
      expect(s).toBeLessThan(2);
      expect(w * s * hh * s).toBeLessThanOrEqual(MAX_CANVAS_AREA_PX + 1);
      expect(Math.max(w, hh) * s).toBeLessThanOrEqual(MAX_CANVAS_SIDE_PX + 1e-6);
    }
  });
});

describe("planBlockLayout", () => {
  const geo = { pageHeight: 100, marginTop: 10, marginBottom: 10, gap: 2 };

  it("packs blocks and moves a non-fitting block to the next page whole", () => {
    const out = planBlockLayout([30, 30, 30], geo);
    expect(out.map((s) => s.length)).toEqual([1, 1, 1]);
    expect(out[0][0]).toMatchObject({ page: 0, y: 10 });
    expect(out[1][0]).toMatchObject({ page: 0, y: 42 });
    expect(out[2][0]).toMatchObject({ page: 1, y: 10 }); // 74 + 30 > 90
  });

  it("slices a block taller than a page across pages", () => {
    const [slices] = planBlockLayout([200], geo);
    expect(slices.map((s) => s.page)).toEqual([0, 1, 2]);
    expect(slices.map((s) => s.h)).toEqual([80, 80, 40]);
    expect(slices.map((s) => s.srcY)).toEqual([0, 80, 160]);
  });
});

describe("exportToPdf", () => {
  const section = (i: number, px = 400) => ({ title: `S${i}`, body: `H=${px}` });

  function assertInsidePages(images: Img[]) {
    for (const im of images) {
      expect(im.y).toBeGreaterThanOrEqual(MARGIN - 1e-6);
      expect(im.y + im.h).toBeLessThanOrEqual(PAGE_H - MARGIN + 1e-6);
    }
  }

  it("rasterizes per block instead of one giant canvas, and paginates", async () => {
    const sections = Array.from({ length: 30 }, (_, i) => section(i));
    await exportToPdf({ title: "T", sections, footer: "F", filename: "chat" });

    // header + 30 cards + footer, each rendered separately
    expect(h.rendered).toHaveLength(32);
    expect(h.rendered.every((el) => el.children.length < 30)).toBe(true);
    // 30 × 400 px blocks ≈ 30 × 52 mm → needs several A4 pages
    expect(h.pages).toBeGreaterThan(4);
    assertInsidePages(h.images);
    expect(h.saved).toEqual(["chat.pdf"]);
  });

  it("slices a section taller than a page across several pages", async () => {
    const tall = 6000; // ≈ 830 mm
    await exportToPdf({ title: "T", sections: [section(0, tall)], filename: "tall" });
    const sliced = h.images.slice(1); // [0] is the header
    expect(sliced.length).toBeGreaterThanOrEqual(3);
    expect(sliced.reduce((sum, im) => sum + im.h, 0)).toBeCloseTo(pxToMm(tall), 3);
    assertInsidePages(h.images);
  });

  it("propagates render failures and always removes the off-screen host", async () => {
    h.failRender = true;
    const before = document.body.children.length;
    await expect(exportToPdf({ title: "T", sections: [section(0)], filename: "x" }))
      .rejects.toThrow("canvas exceeds max size");
    expect(document.body.children.length).toBe(before);
    expect(h.saved).toEqual([]);
  });
});
