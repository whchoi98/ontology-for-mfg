# web/CLAUDE.md

Next.js 16 App Router frontend (React 19, Turbopack builds, Tailwind CSS 4). Dark-theme
dashboard for the 12 manufacturing scenarios + 22-class object explorer +
5-area ops console + code knowledge graph view + global "Manny" floating
chatbot.

## Layout

```
web/
├── app/                       Next.js App Router
│   ├── page.tsx               Home (hero + 12-scenario card grid + 22-class object grid)
│   ├── layout.tsx             Server-side root layout — delegates chrome to LayoutShell
│   ├── globals.css            Tailwind 4 entry: @import + @source list + @theme (brand/ink/accent/wow, font, pulse-soft) + .chat-markdown
│   ├── tailwind-v3-compat.css v3 look on v4: v3 palette, v3 text line-heights, Preflight border/placeholder/cursor
│   ├── manny/                 Chat-only popup surface (loaded into FloatingChat's popup/iframe)
│   ├── chat/                  B — Bedrock chat (SSE phase chips + markdown + PDF + follow-up chips)
│   ├── search/                A — hybrid search results + Cytoscape subgraph
│   ├── insights/              C — KPI strip + chart + summary markdown (JSON API, no LLM) + PDF export
│   ├── spec/                  D — natural-lang req → candidates + standards graph + PDF
│   ├── compliance/            E — REACH-SVHC/RoHS substance verdict (incl. 판정 불가)
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
│   ├── api-base.ts            apiUrl() — single source of the `/api` prefix
│   ├── api-client.ts          fetch helpers + SSE streamers (chat, eight_d, sse_stream)
│   ├── chat-history.ts        historyFrom() / isCompleteStop() — client-held chat context (ADR-012)
│   ├── sse-events.ts          TS mirror of api/schemas/sse.py event union
│   ├── manny-bridge.ts        /manny ↔ FloatingChat same-origin postMessage (ESC close)
│   ├── persona-context.tsx    useActivePersona() — drives 12 scenarios
│   ├── pdf-export.ts          Reusable A4 export pipeline (jsPDF + html2canvas)
│   └── types.ts               TradeLane, CytoscapeGraph, Persona, …
├── public/
│   ├── logos/                 AWS + 3 demo brand SVGs for CompanyLogo
│   └── codegraph/             graphify output (graph.html, graph.json, …)
├── __tests__/                 vitest (jsdom) suites — pages, SSE, PDF, api-base
├── Dockerfile                 Next standalone runtime; copies public/ explicitly
├── eslint.config.mjs          ESLint 9 flat config (eslint-config-next 16) — replaces `next lint`
├── vitest.config.mts          Vitest 4 / Vite 8 (Oxc JSX transform, `@/` alias)
├── postcss.config.js          `@tailwindcss/postcss` only (no autoprefixer — v4 prefixes itself)
└── next.config.js             output: "standalone", reactStrictMode (no webpack() hook)
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
- **Chat context** — `/chat` and `/manny` pass `historyFrom(messages)` as
  `chatStream`'s 5th argument. Mark an answer `complete` only on
  `stop(end_turn)` (`isCompleteStop`) — blocked / failed / cancelled turns
  must never be replayed. A persona switch or 「새 대화」/「새로」 starts a new
  session with empty history.
- **SSE consumption** — Use the helpers in `lib/api-client.ts`
  (`chatStream`, `eightDStream`, internal `sseStream`). Don't reimplement
  EventSource parsing. The chat stream now includes `suggested_followups`
  events; consumers should render them as clickable chips (see `chat/page.tsx`
  and `manny/page.tsx` for the pattern). Every stream ends with a `stop`, also
  on failure (`error:<status>`, `fetch_error:…`) and on cancel (`aborted`).
  Consumers guard callbacks with a stream token (drop late events after a
  cancel / persona switch), cancel on unmount, and render `error` events.
- **API URLs** — build them with `apiUrl()` from `lib/api-base.ts`
  (`NEXT_PUBLIC_API_BASE` is the full prefix incl. `/api`); never hardcode
  `/api/...` in pages or components.
- **Dynamic route params are Promises** (Next 15+, sync access removed in
  16). Client pages unwrap them with React `use()`:
  `function Page({ params }: { params: Promise<{ type: string }> }) { const { type } = use(params); … }`
  (see `objects/[type]`, `ops/[area]`). Type the props inline — don't use the
  generated global `PageProps<'/route'>` helper: CI runs `tsc` before
  `next build`, when `.next/types` doesn't exist yet. Tests pass
  `Promise.resolve({...})` inside `<Suspense>` + `await act(...)`.
- **Nullable API metrics** — Neptune-backed rows can omit fields or carry
  `null` (e.g. real SUPPLIED_BY rows have no stock / defect ppm / price delta;
  price, lead time, OTD, MOQ may be null). Never call `.toFixed()` /
  `.toLocaleString()` on raw response fields; format through guards (see
  `num` / `fmt*` in `price/page.tsx`) and render `—` / `정보 없음`, not 0.
  Respect `summary.price_available` / `leadtime_available` (0 placeholders).
- **Compliance verdicts** — `/api/compliance` returns
  `status: compliant | non_compliant | insufficient_data | invalid_input`;
  `insufficient_data` (`compliant: null`, no substance declaration) must
  render as its own "판정 불가" state — no data ≠ compliant. Violations use
  `{regulation, substance, severity, message?}`.
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

- **Runtime image has no npm** — the Dockerfile's runtime stage deletes the
  base image's bundled npm/npx (`node server.js` is all it runs); they carried
  the image's fixable HIGH scan findings. Use the build stage for npm work.
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
- **Turbopack is the default bundler** (`next dev` and `next build`).
  `next build` fails if `next.config.js` gains a `webpack()` hook — migrate
  it to `turbopack` options or switch the build script to `next build --webpack`.
  `next dev` writes to `.next/dev`, so dev and build can run concurrently.
- **Next owns `tsconfig.json` `jsx` and `next-env.d.ts`** — Next 16 forces
  `"jsx": "react-jsx"` and rewrites `next-env.d.ts` (it imports
  `.next/types/routes.d.ts` after a build, `.next/dev/types/…` after `next dev`).
  Don't hand-edit; commit the post-`next build` variant. Vitest sets its own
  JSX runtime (`oxc.jsx` in `vitest.config.mts`) so it doesn't depend on it.
- **Vitest 4 runs on Vite 8 (Oxc, not esbuild)** — the `esbuild` config key
  is deprecated/ignored for JSX; use `oxc` options.
- **`react-simple-maps` 3.0.0 + `overrides`** — 3.0.0 declares React ≤ 18
  peers but only uses `forwardRef` + `propTypes` (ignored by React 19), so
  `package.json` `overrides` maps its `react`/`react-dom` peers to ours. This
  keeps plain `npm ci` (CI and Dockerfile) working without
  `--legacy-peer-deps`. It still pulls d3 v2 / d3-color 1.0.1 transitively;
  `react-simple-maps` 5.x (React 19 peers, d3 v3) is the upgrade path.
- **ESLint** — `npm run lint` (`eslint .`). React-Compiler readiness rules
  from eslint-plugin-react-hooks v7 (`set-state-in-effect`, `refs`,
  `immutability`) are downgraded to warnings until the fetch-in-effect code is
  refactored. Stay on ESLint 9 — several bundled plugins don't list ESLint 10
  as a peer yet, which would break plain `npm ci`.
- **Tailwind 4 is configured in CSS, not JS** — there is no
  `tailwind.config.*`. Theme tokens live in `@theme` in `app/globals.css`
  (custom colors → `--color-ink-800` etc.; font → `--font-sans`; animation →
  `--animate-pulse-soft` + `@keyframes`). The import is
  `@import 'tailwindcss' source(none)` plus explicit `@source` lines for
  `app/`, `components/`, `lib/`. Automatic detection would otherwise scan all
  of `web/` (incl. `public/codegraph/graph.html`). Add an `@source` line if
  class names move to a new directory. Class names must stay complete static
  strings (maps of full class strings are fine; `` `bg-${tone}` `` is not).
- **`tailwind-v3-compat.css` keeps the v3 look** — it pins the v3 hex
  palette (v4's OKLCH palette renders differently), the v3 absolute `text-*`
  line-heights (v4's unitless ratios change the line box of children that
  only set a font size, e.g. `text-[10px]` inside `text-xs`), and the v3
  Preflight defaults: border `gray-200`, placeholder `gray-400`,
  `cursor: pointer` on buttons. Remove a block only when deliberately adopting
  the v4 default.
- **v4 class-name gotchas** — gradients use `bg-linear-to-*/srgb` (bare
  `bg-linear-to-*` interpolates in OKLab, unlike v3). v3's `rounded` /
  `shadow` / `blur` / `outline-none` / `ring` are spelled `rounded-sm` /
  `shadow-sm` / `blur-sm` / `outline-hidden` / `ring-3` in v4, and each old
  `-sm` step is now `-xs`. A bare v4 `ring` is 1px and `currentColor`, so
  always pair a ring width with a ring color. `space-y-*` now puts
  `margin-bottom` on all but the last child with zero specificity, so a child's
  own `mb-*` / `mt-*` overrides the spacing. v3 did the opposite. Don't put
  vertical margins on direct children of `space-y-*`. v4 Preflight makes
  `input` / `select` / `textarea` backgrounds transparent (v3: UA white). Every
  control here sets a `bg-ink-*` class, and new ones should too. `hover:` only applies on
  devices that support hover (`@media (hover: hover)`). `@tailwindcss/upgrade`
  also rewrites matching words in prose strings (it changed "ring buffer" to
  "ring-3 buffer" in `GuidedTour.tsx`), so review its diff if you re-run it.
- **`/manny` must stay chrome-less** — `LayoutShell` recognizes the path
  and renders only `{children}`. If you add a sidebar to it, the iframe
  modal will show a nested sidebar inside the modal frame.

## Commands

```bash
cd web && npm ci                              # plain npm ci — no --legacy-peer-deps needed
cd web && ./node_modules/.bin/tsc --noEmit   # strict, must be clean
cd web && npm test                            # vitest 4 (jsdom) — __tests__/*.test.ts(x)
cd web && npm run lint                        # eslint . (flat config; `next lint` is gone in Next 16)
cd web && npm run build                       # next build (Turbopack; also runs tsc + route type validation)
cd web && npm run dev                         # next dev (Turbopack) → http://localhost:3000
```

Standalone smoke (mirrors the Dockerfile): after `npm run build`, copy
`public/` → `.next/standalone/public` and `.next/static` →
`.next/standalone/.next/static`, then `PORT=3000 node .next/standalone/server.js`.
ALB health check: `GET /api/health-web` → `{"status":"ok"}`.
