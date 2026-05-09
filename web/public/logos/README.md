# Sidebar Company Logo Presets

The sidebar header shows a small company-logo button next to the "Ontology Retail · v0.7.0" version pill. Clicking the logo cycles through the presets defined in this folder.

## Default

`aws.svg` — AWS smile logo (project hosted on AWS).

## Swap for a demo

Two ways to change the logo:

### 1. Live, no rebuild — click to cycle

Click the logo in the sidebar. It cycles through the presets registered in `web/components/CompanyLogo.tsx:LOGO_PRESETS` and persists your choice in `localStorage` (`ontology-retail.company-logo`). Per-browser, no server change.

### 2. Add a custom preset (rebuild required)

1. Drop your SVG (or PNG) into `web/public/logos/<your-id>.svg`. Aim for ~120×72 viewBox or a similar 5:3 aspect; the sidebar renders it at 32×24 px with `object-contain`.
2. Append a row to `LOGO_PRESETS` in `web/components/CompanyLogo.tsx`:
   ```ts
   { id: 'mybrand', label: 'MyBrand', src: '/logos/mybrand.svg' },
   ```
3. Optionally set the *default* preset via env var `NEXT_PUBLIC_DEFAULT_LOGO_PRESET=mybrand` in `web/Dockerfile`/CDK env block. Without that, the default stays `aws`.
4. `docker build` the web image; deploy.

The asset path is plain `/logos/...` (Next.js static), no auth — anyone can reach the SVG directly. Don't put confidential brand assets here.

## License note

The included `aws.svg` is a stylized typographic representation of "AWS" with a smile-like swoosh — *not* the official AWS Smile logo. The other three presets (`demo-blue`, `demo-emerald`, `demo-violet`) are generic placeholder marks. Replace with licensed brand assets before using in real customer-facing demos.
