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
  host.style.padding = "28px 32px";
  host.style.background = "#ffffff";
  host.style.color = "#111";
  host.style.fontFamily = "'Noto Sans KR', system-ui, sans-serif";
  host.style.fontSize = "13px";
  host.style.lineHeight = "1.65";

  const h1 = document.createElement("h1");
  h1.textContent = opts.title;
  h1.style.fontSize = "20px";
  h1.style.borderBottom = "2px solid #1f2937";
  h1.style.paddingBottom = "6px";
  h1.style.margin = "0 0 12px";
  host.appendChild(h1);

  if (opts.subtitle) {
    const sub = document.createElement("div");
    sub.style.fontSize = "12px";
    sub.style.color = "#374151";
    sub.style.fontWeight = "600";
    sub.style.marginBottom = "6px";
    sub.textContent = opts.subtitle;
    host.appendChild(sub);
  }
  if (opts.meta) {
    const m = document.createElement("div");
    m.style.fontSize = "11px";
    m.style.color = "#6b7280";
    m.style.marginBottom = "4px";
    m.textContent = opts.meta;
    host.appendChild(m);
  }
  if (opts.meta2) {
    const m = document.createElement("div");
    m.style.fontSize = "11px";
    m.style.color = "#6b7280";
    m.style.marginBottom = "16px";
    m.textContent = opts.meta2;
    host.appendChild(m);
  }

  for (const s of opts.sections) {
    const card = document.createElement("div");
    card.style.margin = "0 0 14px";
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
    const canvas = await html2canvas(host, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.95);

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(`${opts.filename}.pdf`);
  } finally {
    host.remove();
  }
}
