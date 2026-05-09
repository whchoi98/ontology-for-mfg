# ADR-005 — Client-side PDF export via jsPDF + html2canvas

- **Status**: Accepted
- **Date**: 2026-05-09
- **Related commits**: `f5e3764`, `ab44b9b`, `21bc341`

## Context

Five scenarios (chat, 8D, insights, spec, lane reroute) need PDF export
for sharing demo artifacts: 8D AIAG reports for QA reviewers, insights
KPI summaries for execs, lane reroute simulations for SCM. The choice
is between rendering on the server vs the browser.

Demo is Cognito-protected and runs on ECS Fargate; users are
authenticated humans on modern browsers. The result must include Korean
text and dark→light theme inversion.

## Decision

**Client-side, browser-rendered**. Single shared helper at
`web/lib/pdf-export.ts`:

1. Construct an off-screen white-themed DOM tree with the per-page
   sections
2. Rasterize with `html2canvas` at 2× scale → JPEG-95
3. Slice into A4 pages with `jsPDF` (multi-page handling)

Each page provides only its title, metadata strip, sections list (with
optional `accentColor`), and filename via `PdfExportOptions`.

## Alternatives Considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Server-side PDF via WeasyPrint | Selectable text; better Korean font support | Adds Python dep + server CPU cost; one more service surface | Not justified at PoC scale |
| Server-side via Puppeteer (headless Chrome) | Full HTML fidelity | Heavy runtime; Chromium in container | Too heavy |
| Server + pdf-lib (Korean TTF embedded) | Lightweight, vector | Larger client bundle size; Korean font subsetting | Better for v2 |
| Markdown-only export (no PDF) | Trivial | Not what users asked for; PDF is the lingua franca for boards/audits | No |

## Consequences

- **Positive**:
  - Helper extraction (commit `ab44b9b`) → 5 pages × ~10–30 lines
    each instead of ~120 lines × 5 = 600 lines duplicated
  - Page-specific accent colors (`#3b82f6 blue` for input,
    `#10b981 emerald` for results, `#f59e0b orange` for events,
    `#a855f7 purple` for analysis) carry semantic meaning into print
  - Zero server cost; CloudFront caches static jsPDF bundle
- **Trade-offs**:
  - **Text is rasterized → not selectable in PDF readers**. Acceptable
    for visual reports, blocking for legal / audit use cases
  - Korean glyphs depend on whatever Noto Sans KR is loaded in the
    browser when html2canvas runs; on unusual fonts the PDF may show
    boxes
  - 2× scale → ~500KB–1.5MB PDFs (acceptable for sharing)
- **Follow-ups**:
  - When selectability is required, migrate to pdf-lib + embedded
    Noto Sans KR subset (no html2canvas in the path)
  - Add `setProperties({ title, author, creator })` to jsPDF for SEO /
    archiving metadata

## References

- Code: `web/lib/pdf-export.ts`, callers in `chat`, `eight-d`, `insights`,
  `spec`, `lane`
- CHANGELOG: `0.3.0 § feat(8d)`, `0.4.0 § Features — feat(web)`
