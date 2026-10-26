// web/lib/pdf-export.ts
//
// Reusable PDF export helper. Builds a hidden white-themed DOM tree, rasterizes
// it with html2canvas, and emits a multi-page A4 PDF via jsPDF.
//
// Both the chat scenario log and the 8D AIAG report use the same overall
// pipeline (off-screen DOM → canvas → JPEG slices → A4 pages); the only
// per-page variations are header text, the per-section card render, and the
// filename. So we factor those into `PdfExportOptions` and let the page wire
// them.
//
// Rasterization is per BLOCK (header, each section card, footer), never the
// whole document at once: a single canvas for a long chat blows past browser
// canvas limits (Safari ≈16.7M px², Chromium 32,767 px per side) and comes
// back blank, which made jsPDF throw. Blocks are packed onto pages without
// splitting; only a block taller than a page is sliced, and a block that
// would still exceed the canvas limits is rendered at a reduced scale.
//
// Why an off-screen DOM rather than jsPDF.html() / autoTable? — html2canvas
// gives us pixel-perfect control over Korean font rendering, dark→light
// theme inversion, and page-break-friendly card layout, all without a heavy
// vector pipeline. Tradeoff: text in the resulting PDF is rasterized (not
// selectable). Acceptable for a PoC report; an upgrade path exists via
// pdf-lib + Korean TTF embedding if selectability becomes a requirement.

export interface PdfSection {
  /** Optional small badge label (e.g. "D1", "사용자"). */
  badge?: string;
  /** Bold heading line. */
  title: string;
  /** Body text (preserves whitespace, wraps long lines). */
  body: string;
  /** Optional secondary line below the body (e.g. tool call summary). */
  footer?: string;
  /** Optional left-border accent color, e.g. "#f59e0b". */
  accentColor?: string;
}

export interface PdfExportOptions {
  /** Big H1 line. */
  title: string;
  /** Optional muted line under the title (e.g. session id or incident title). */
  subtitle?: string;
  /** Optional second muted line (e.g. severity / component / plant). */
  meta?: string;
  /** Optional third muted line (e.g. generation mode + total time + timestamp). */
  meta2?: string;
  /** Cards/sections, rendered in order. */
  sections: PdfSection[];
  /** Optional bottom-of-doc footer line. */
  footer?: string;
  /** Filename without extension (we append .pdf). */
  filename: string;
}

const HOST_WIDTH_PX = 760;
/** Host padding (px) — doubles as the PDF page margin after scaling. */
const HOST_PAD_X_PX = 32;
const HOST_PAD_Y_PX = 28;
/** Vertical gap between blocks (px, same as the card margin). */
const BLOCK_GAP_PX = 14;
/** Preferred raster scale (crisp text); reduced only for oversize blocks. */
const RASTER_SCALE = 2;
/** Conservative cross-browser canvas limits (Safari/iOS are the tightest). */
export const MAX_CANVAS_SIDE_PX = 16_384;
export const MAX_CANVAS_AREA_PX = 16_777_216;

/** Largest scale ≤ `preferred` that keeps a `widthPx × heightPx` element's
 *  canvas inside the browser limits. */
export function safeRasterScale(widthPx: number, heightPx: number, preferred = RASTER_SCALE): number {
  if (!(widthPx > 0) || !(heightPx > 0)) return preferred;
  const bySide = MAX_CANVAS_SIDE_PX / Math.max(widthPx, heightPx);
  const byArea = Math.sqrt(MAX_CANVAS_AREA_PX / (widthPx * heightPx));
  return Math.min(preferred, bySide, byArea);
}

export interface PageGeometry {
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  gap: number;
}

/** One rectangle of a block on a page (all values in mm). `srcY` is the
 *  offset into the block — non-zero only for slices of a block taller than a
 *  page. */
export interface BlockSlice { page: number; y: number; srcY: number; h: number }

const EPS = 1e-6;

/** Pack blocks (heights in mm) top-to-bottom onto pages. A block is moved to
 *  the next page rather than split, unless it is taller than a whole page —
 *  then it is sliced across pages. Returns the slices for each block. */
export function planBlockLayout(heights: number[], geo: PageGeometry): BlockSlice[][] {
  const top = geo.marginTop;
  const bottom = geo.pageHeight - geo.marginBottom;
  const usable = bottom - top;
  let page = 0;
  let y = top;
  return heights.map((h) => {
    if (y > top + EPS && y + h > bottom + EPS) {
      // Doesn't fit in what is left of this page → start a fresh page.
      page += 1;
      y = top;
    }
    const slices: BlockSlice[] = [];
    if (h <= usable + EPS) {
      slices.push({ page, y, srcY: 0, h });
      y += h;
    } else {
      let srcY = 0;
      while (srcY < h - EPS) {
        if (bottom - y <= EPS) { page += 1; y = top; }
        const take = Math.min(bottom - y, h - srcY);
        slices.push({ page, y, srcY, h: take });
        srcY += take;
        y += take;
      }
    }
    y += geo.gap;
    return slices;
  });
}

export async function exportToPdf(opts: PdfExportOptions): Promise<void> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${HOST_WIDTH_PX}px`;
  host.style.padding = `${HOST_PAD_Y_PX}px ${HOST_PAD_X_PX}px`;
  host.style.background = "#ffffff";
  host.style.color = "#111";
  host.style.fontFamily = "'Noto Sans KR', system-ui, sans-serif";
  host.style.fontSize = "13px";
  host.style.lineHeight = "1.65";

  // Each top-level child of `host` is one rasterized block.
  const header = document.createElement("div");
  header.style.background = "#ffffff";
  host.appendChild(header);

  const h1 = document.createElement("h1");
  h1.textContent = opts.title;
  h1.style.fontSize = "20px";
  h1.style.borderBottom = "2px solid #1f2937";
  h1.style.paddingBottom = "6px";
  h1.style.margin = "0 0 12px";
  header.appendChild(h1);

  if (opts.subtitle) {
    const sub = document.createElement("div");
    sub.style.fontSize = "12px";
    sub.style.color = "#374151";
    sub.style.fontWeight = "600";
    sub.style.marginBottom = "6px";
    sub.textContent = opts.subtitle;
    header.appendChild(sub);
  }
  if (opts.meta) {
    const m = document.createElement("div");
    m.style.fontSize = "11px";
    m.style.color = "#6b7280";
    m.style.marginBottom = "4px";
    m.textContent = opts.meta;
    header.appendChild(m);
  }
  if (opts.meta2) {
    const m = document.createElement("div");
    m.style.fontSize = "11px";
    m.style.color = "#6b7280";
    m.style.marginBottom = "4px";
    m.textContent = opts.meta2;
    header.appendChild(m);
  }

  for (const s of opts.sections) {
    const card = document.createElement("div");
    card.style.margin = `0 0 ${BLOCK_GAP_PX}px`;
    card.style.padding = "12px 14px";
    card.style.border = "1px solid #d1d5db";
    if (s.accentColor) card.style.borderLeft = `4px solid ${s.accentColor}`;
    card.style.borderRadius = "4px";
    card.style.background = "#fafafa";
    card.style.pageBreakInside = "avoid";

    const hdr = document.createElement("div");
    hdr.style.fontSize = "12px";
    hdr.style.fontWeight = "700";
    hdr.style.color = "#111827";
    hdr.style.marginBottom = "6px";
    hdr.textContent = s.badge ? `${s.badge} — ${s.title}` : s.title;
    card.appendChild(hdr);

    const body = document.createElement("div");
    body.style.fontSize = "12px";
    body.style.lineHeight = "1.65";
    body.style.color = "#1f2937";
    body.style.whiteSpace = "pre-wrap";
    body.style.wordBreak = "break-word";
    body.textContent = s.body || "(내용 없음)";
    card.appendChild(body);

    if (s.footer) {
      const f = document.createElement("div");
      f.style.fontSize = "10px";
      f.style.color = "#6b7280";
      f.style.marginTop = "6px";
      f.textContent = s.footer;
      card.appendChild(f);
    }

    host.appendChild(card);
  }

  if (opts.footer) {
    const f = document.createElement("div");
    f.style.borderTop = "1px solid #e5e7eb";
    f.style.paddingTop = "8px";
    f.style.marginTop = "8px";
    f.style.fontSize = "10px";
    f.style.color = "#9ca3af";
    f.textContent = opts.footer;
    host.appendChild(f);
  }

  document.body.appendChild(host);
  try {
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    // Same px → mm mapping as before: the full host width spans the page.
    const mmPerPx = pageWidth / HOST_WIDTH_PX;
    const marginX = HOST_PAD_X_PX * mmPerPx;
    const contentWidth = pageWidth - 2 * marginX;

    const canvases: HTMLCanvasElement[] = [];
    for (const block of Array.from(host.children) as HTMLElement[]) {
      const rect = block.getBoundingClientRect();
      const canvas = await html2canvas(block, {
        scale: safeRasterScale(rect.width, rect.height),
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      if (canvas.width > 0 && canvas.height > 0) canvases.push(canvas);
    }
    if (canvases.length === 0) throw new Error("PDF 렌더링 결과가 비어 있습니다");

    const layout = planBlockLayout(
      canvases.map((c) => (c.height * contentWidth) / c.width),
      {
        pageHeight,
        marginTop: HOST_PAD_Y_PX * mmPerPx,
        marginBottom: HOST_PAD_Y_PX * mmPerPx,
        gap: BLOCK_GAP_PX * mmPerPx,
      },
    );

    let currentPage = 0;
    layout.forEach((slices, i) => {
      const canvas = canvases[i];
      const pxPerMm = canvas.width / contentWidth;
      for (const sl of slices) {
        while (currentPage < sl.page) { pdf.addPage(); currentPage += 1; }
        const img = slices.length === 1
          ? canvas
          : cropCanvas(canvas, Math.round(sl.srcY * pxPerMm), Math.round(sl.h * pxPerMm));
        pdf.addImage(img.toDataURL("image/jpeg", 0.95), "JPEG", marginX, sl.y, contentWidth, sl.h);
      }
    });
    pdf.save(`${opts.filename}.pdf`);
  } finally {
    host.remove();
  }
}

/** Copy a horizontal band of `src` into its own canvas (for page slices). */
function cropCanvas(src: HTMLCanvasElement, sy: number, sh: number): HTMLCanvasElement {
  const height = Math.max(1, Math.min(sh, src.height - sy));
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("PDF 페이지 분할용 canvas를 만들 수 없습니다");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, sy, src.width, height, 0, 0, src.width, height);
  return out;
}
