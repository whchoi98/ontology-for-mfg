# CHANGELOG.md

## 0.4.0 — 2026-05-09

### Highlights
- 8D writer flipped to Haiku 4.5 + maxTokens 1500 — fallback no longer fires on every call
- 8D PDF export added; underlying renderer extracted to a reusable `lib/pdf-export.ts`
- Validation report now reads live Neptune counts via `/api/ops/ingest`
- Hero title rephrased to "온톨로지/Agentic AI" to reflect the agentic layer
- 8D Bedrock phase chip now shows the actual runtime model name (Haiku 4.5 / Sonnet 4.6)

### Features
- **perf(8d)** — Switch the 8D writer from Sonnet 4.6 to Haiku 4.5 (`settings.haiku_model`,
  CRIP `global.anthropic.claude-haiku-4-5-20251001-v1:0`). Cap `maxTokens` 3000→1500 since
  each D-section is 1–3 Korean sentences. Average pipeline drops from ~36s (timeout +
  fallback) to ~6–10s (real LLM result). The 25s budget + deterministic fallback stay as
  a safety net.
- **feat(8d)** — PDF download button (jsPDF + html2canvas) on `/eight-d` next to
  MD copy / MD download. White A4 with title bar, incident metadata strip,
  and 8 D-section cards with orange left-border accent. Falls back to splitting
  markdown headings if the SSE result didn't carry `sections`.
- **feat(web)** — `web/lib/pdf-export.ts` — reusable export pipeline shared by chat
  and 8D pages. Configurable per-section `accentColor` lets each scenario keep its
  visual identity (sky/emerald for chat, orange for 8D) while sharing the
  off-screen-DOM → html2canvas → jsPDF pipeline.
- **feat(8d)** — Bedrock phase chip label is now derived from the actual model id
  passed in the SSE phase event. Backend `_short_model_label()` maps CRIP ids to
  user-friendly names (Haiku 4.5 / Sonnet 4.6 / Opus). UI prefers the server-emitted
  label over the static fallback.
- **ux(home)** — Hero title "온톨로지 그래프" → "온톨로지/Agentic AI" so the agentic
  layer (Bedrock Converse, tool-use, AgentCore Memory) is visible in the lead message.

### Fixes
- **fix(validation)** — `/validation` page now calls `/api/ops/ingest` on mount and
  on the refresh button instead of leaving 6 of 8 rows as a static
  "Neptune 직접 쿼리 필요" placeholder. Pass/fail rendered with actual counts vs
  spec § 8.4 minimums; auto-runs at page load. Layout aligned with the rest of the
  project (`max-w-4xl mx-auto` + ScenarioHeader).
- **fix(home)** — Forced `<br/>` removed from hero `<h1>`. Title now flows on a
  single line on wide screens, wraps naturally on narrow ones — matching the
  description paragraph behaviour.

### Internal
- v0.3.0 annotated git tag attached to commit `2c2ab56`.
- Chat scenario log PDF refactored onto the shared helper — chat code shed
  ~80 lines of duplicate canvas/PDF setup.

## 0.3.0 — 2026-05-09

### Highlights
- Operations console rewritten end-to-end (5 areas: ingest / guardrail / memory / eval / trace)
- Code knowledge graph (graphify) integrated as same-origin viewer with LLM-labelled communities
- 8D pipeline now SSE-streamed with live phase chips + markdown rendering
- Deterministic read-only guard on the chat tool's Neptune gateway (Kiro-flagged Cypher injection)
- UI alignment unified across all 12 scenario pages and the home hero

### Features
- **feat(ops)** — `/api/ops/{ingest,guardrail,memory,eval,trace}` rebuilt to mirror retail's contract:
  Neptune label/edge counts (with 22-class fallback), CW guardrail event window plus 4 mfg topic
  cards (IP / Competitor / Regulation / Hazardous), DynamoDB memory snapshot, 30 mfg-domain wow
  query scoreboard with live re-run, agent-service trace ring buffer.
- **feat(codegraph)** — graphify AST extraction integrated as a same-origin `/codegraph` page:
  iframe + manifest stats + report/json links, fullscreen mode, MD copy/download. 188 communities
  labelled with intuitive Korean names via Bedrock Haiku 4.5 (e.g. "인사이트 분석 라우터",
  "Cytoscape 그래프 뷰", "8D 리포트 생성기"). Both node tooltips and the left legend reflect
  the labels.
- **feat(8d)** — `/eight-d` converted from sync JSON to SSE EventSourceResponse. Live phase chips
  for Neptune / KB / Bedrock stages, markdown report assembled server-side, copy + download
  buttons. 25s in-process timeout preserves the deterministic fallback so 504s never surface.
- **feat(sidebar)** — AWS logo button on the right of the header, click-cycles through 4 presets
  (AWS / Demo Blue / Hi-Tech MFG Demo / Auto Electronics) with localStorage persistence; designed
  for live-demo brand swap without a redeploy.

### Fixes
- **fix(security)** — `_tool_neptune` in chat now applies a regex deny-list for write/destructive
  Cypher (CREATE / DELETE / DETACH DELETE / SET / REMOVE / MERGE / DROP / FOREACH / LOAD CSV /
  CALL db./dbms./apoc.write). Prompt-injection through the agent can no longer mutate the graph;
  blocked queries return a structured error so the LLM can course-correct.
- **fix(api+web)** — `/eight-d` 504 (Bedrock > 30s gateway timeout) eliminated by 25s
  ThreadPoolExecutor budget; client-side Cytoscape exception on Product/Module/Component fixed
  by Neptune-internal-id → app-id mapping in subgraph builder + frontend dangling-edge filter.
- **fix(auth)** — Cognito logout matched the registered LogoutURL by appending the missing
  trailing slash, eliminating the "Required String parameter 'redirect_uri' is not present"
  error on sidebar logout.
- **fix(web)** — main-page hero description no longer wraps at the third scenario card; all 12
  main pages now use a consistent two-tier width system (`max-w-4xl mx-auto` form-narrow,
  `max-w-7xl mx-auto` wide-grid) so `/insights`, `/rfm`, `/esg`, `/pdm`, `/compliance`,
  `/search`, `/spec` no longer left-align against the sidebar.
- **fix(web/docker)** — Next.js standalone runtime now explicitly copies `public/`, fixing 404s
  on `/codegraph/*` and any future static asset.
- **fix(build)** — `.dockerignore` excludes `web/.next/`, `web/node_modules/`, `tsconfig.tsbuildinfo`
  so stale local build artefacts can no longer enter the docker context (previously caused
  pre-edit JSX class names to ship in apparently fresh builds).
- **fix(web)** — CytoscapeView hardened against malformed graph data: node-id dedupe, dangling
  edge filtering, try/catch around `cytoscape()` with readable error UI, stable `onNodeTap` ref
  to stop unnecessary remounts.

### Internal
- agent service now records each tool_call in a 200-deep in-process ring buffer
  (`recent_traces(limit, session_id)`) consumed by `/api/ops/trace`.
- 4 SVG logo presets shipped under `web/public/logos/`.
- graphify post-processor `scripts/label_communities.py` regenerates community labels via
  Bedrock when graph.json changes.

## 0.2.0 — Plan 1/2 baseline
- 12 retail-style scenario pages, 22 ontology-class object explorer
- 5-persona context, dark theme design system
- Cognito auth gate + custom domain (mfg-ontology.whchoi.net)

## 0.1.0-foundation
- Project skeleton + standards mapping (Phase 0)
- Synthetic data generators (Phase 1)
- 6 CDK stacks (Phase 2)
