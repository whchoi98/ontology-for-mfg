# web/CLAUDE.md

Next.js 14 App Router frontend. Dark-theme dashboard for the 12 manufacturing
scenarios + 22-class object explorer + 5-area ops console + code knowledge
graph view + global "Manny" floating chatbot.

## Layout

```
web/
├── app/                       Next.js App Router
│   ├── page.tsx               Home (hero + 12-scenario card grid + 22-class object grid)
│   ├── layout.tsx             Server-side root layout — delegates chrome to LayoutShell
│   ├── manny/                 Chat-only popup surface (loaded into FloatingChat's popup/iframe)
│   ├── chat/                  B — Bedrock chat (SSE phase chips + markdown + PDF + follow-up chips)
│   ├── search/                A — hybrid search results + Cytoscape subgraph
│   ├── insights/              C — KPI strip + chart + Sonnet markdown + PDF export
│   ├── spec/                  D — natural-lang req → candidates + standards graph + PDF
│   ├── compliance/            E — REACH/RoHS/AEC-Q verification
│   ├── substitute/            F — 3-pane: req / candidates / common standards
│   ├── price/                 G — 3-pane: candidate / matrix / best-supplier highlight
│   ├── lane/                  H — SCM map + reroute banner with PDF export
│   ├── rfm/                   I — supplier RFM table
│   ├── eight-d/               J — 8D SSE generation + markdown + MD/PDF download
│   ├── esg/                   K — ESG / CBAM
│   ├── pdm/                   L — predictive maintenance alarms
│   ├── objects/[type]/        22-class explorer with 1-hop subgraph
│   ├── ops/[area]/            ops console (ingest / guardrail / memory / eval / trace)
│   ├── codegraph/             graphify code knowledge graph (iframe + fullscreen)
│   ├── schema/                ontology schema visualization
│   ├── standards/             standards mapping table
│   └── validation/            spec § 8.4 live validation against /api/ops/ingest
├── components/
│   ├── LayoutShell.tsx        Client chrome dispatcher — hides chrome on /manny path
│   ├── Sidebar.tsx            Navigation + persona awareness + AWS logo cycler
│   ├── SidebarAuth.tsx        whoami chip + logout button
│   ├── PersonaSwitch.tsx      Top-bar persona chip toggle
│   ├── FloatingChat.tsx       "Manny" launcher — UA-branching popup window vs iframe modal
│   ├── CompanyLogo.tsx        4-preset logo cycler (localStorage-backed)
│   ├── ScenarioHeader.tsx     Scenario A–L breadcrumb + tech sublabel
│   ├── CytoscapeView.tsx      Hardened graph viewer (dedupe/dangling-edge guards)
│   ├── MarkdownView.tsx       react-markdown wrapper
│   ├── KpiStrip.tsx           Top KPI row for /insights
│   ├── SCMMap.tsx             Lane map for /lane
│   └── GuidedTour.tsx         Optional onboarding tour
├── lib/
│   ├── api-client.ts          fetch helpers + SSE streamers (chat, eight_d, sse_stream)
│   ├── persona-context.tsx    useActivePersona() — drives 12 scenarios
│   ├── pdf-export.ts          Reusable A4 export pipeline (jsPDF + html2canvas)
│   └── types.ts               TradeLane, CytoscapeGraph, Persona, …
├── public/
│   ├── logos/                 AWS + 3 demo brand SVGs for CompanyLogo
│   └── codegraph/             graphify output (graph.html, graph.json, …)
├── Dockerfile                 Next standalone runtime; copies public/ explicitly
└── next.config.js             output: "standalone", reactStrictMode
```

## Conventions

- **Width tiers** — Two buckets used across all 12 scenarios:
  - `flex-1 mx-auto w-full max-w-4xl px-6 py-6` (form-narrow): chat, eight-d,
    insights, rfm, esg, pdm, compliance
  - `flex-1 mx-auto w-full max-w-7xl px-6 py-6` (wide-grid): search, spec,
    substitute, price
  - Full-width by design: lane (map), objects/[type] (3-pane), codegraph
    (iframe), ops/[area]
  - Chrome-less by design: `/manny` (renders inside FloatingChat's popup/iframe)
- **Dark theme** — `bg-ink-{900,800,700}` for surfaces, `text-ink-{50..500}`
  for type, `text-accent-300/400` for emphasis. Avoid `bg-white` /
  `text-neutral-*` (legacy)
- **Persona context** — single `useActivePersona()` provides `active` +
  `setActive`. Per-persona route variants were removed in v0.5.2 — persona is
  a runtime concern, not a routing one. `/manny` re-implements the persona
  chip row inline because the popup has no global PersonaSwitch.
- **SSE consumption** — Use the helpers in `lib/api-client.ts`
  (`chatStream`, `eightDStream`, internal `sseStream`). Don't reimplement
  EventSource parsing. The chat stream now includes `suggested_followups`
  events; consumers should render them as clickable chips (see `chat/page.tsx`
  and `manny/page.tsx` for the pattern).
- **PDF export** — Always go through `lib/pdf-export.ts`. Pass section
  arrays with `accentColor` for category color-coding. Don't inline jsPDF
- **Chrome dispatch** — `LayoutShell` is the single source of truth for
  whether sidebar / top bar / FloatingChat render. New chrome-less routes
  go in its `isPopup` branch.
- **Sidebar IA**:
  - 시나리오 (Scenarios) — A–L
  - 메타 (Ontology) — schema · standards · validation · 코드 지식 그래프
  - 객체 탐색 (Knowledge Graph) — 22 classes grouped 5-way
  - 파이프라인 (Ops) — 5 ops areas

## Gotchas

- **Next.js standalone needs explicit `public/` copy** — Dockerfile must
  `COPY --from=build /app/public ./public`. Without it, `/codegraph/*`,
  `/logos/*`, favicon all 404.
- **Stale `web/.next/` poisons builds** — `.dockerignore` excludes it; if
  you see "old className still in bundle" symptoms, wipe `web/.next/` and
  rebuild.
- **Cytoscape edge endpoints** — `CytoscapeView` filters dangling edges
  (source/target not in node set), dedupes node ids, and try/catches
  `cytoscape()` itself. Don't bypass these guards.
- **PDF export images are rasterized** — text in the resulting PDF isn't
  selectable. Acceptable for PoC; upgrade to pdf-lib + Korean TTF embedding
  if selectability becomes a requirement.
- **FloatingChat UA branching is intentional** — Chromium-family browsers
  (Chrome / Edge / Brave / Opera) skip `window.open` because Site Engagement
  Score can downgrade the popup to a new tab unpredictably. They get the
  in-page iframe modal instead. Firefox / Safari respect popup features and
  open a real window. Both target `/manny` (same-origin → Cognito cookies +
  SSE just work). See ADR-010.
- **`/manny` must stay chrome-less** — `LayoutShell` recognizes the path
  and renders only `{children}`. If you add a sidebar to it, the iframe
  modal will show a nested sidebar inside the modal frame.

## TypeScript

```bash
cd web && ./node_modules/.bin/tsc --noEmit   # strict, must be clean
cd web && npm run build                       # next build (also runs tsc)
cd web && npm run dev                         # http://localhost:3000
```
