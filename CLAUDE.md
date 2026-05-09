# CLAUDE.md

Project memory for Claude Code on **ontology-for-mfg** — a Hi-Tech manufacturing
ontology PoC demo (AMZN Tech, Korean / English UI). Mirrors the sister project
`ontology-for-retail`. Currently at **v0.4.0**.

## Overview

- **Custom domain**: `https://mfg-ontology.whchoi.net` (Cognito-protected)
- **Demo users**: `admin@whchoi.net` / `demo@whchoi.net` — credentials in
  1Password vault `ontology-mfg-demo`
- **Ontology**: 22 classes (Product / Module / Component / RawMaterial /
  Manufacturer / Supplier / SubSupplier / CustomerAccount / Plant / Region /
  TradeLane / Standard / Certification / Regulation / Substance /
  QualityIncident / EightDReport / RootCause / Telemetry / MaintenanceEvent /
  ESGIndicator / CarbonScope)
- **Personas (5)**: Buyer / Engineer / Quality / SCM / Plant
- **Scenarios (12, A–L)**: A 의미 검색 · B 대화형 에이전트 · C 인사이트 ·
  D 스펙 매치 · E 규제 검증 · F 대체 부품 · G 단가/재고 · H 글로벌 SCM lane ·
  I 협력사 RFM · J 8D / RCA · K ESG / CBAM · L PdM / IoT
- **Standards**: JEDEC · IPC · AEC-Q · IATF 16949 · ISO 9001 · REACH-SVHC ·
  RoHS · CBAM · IRA · USMCA

## Tech Stack

| Layer | Tech |
|-------|------|
| API | FastAPI (Python 3.12) · sse-starlette · boto3 · opensearch-py 2.7 |
| Web | Next.js 14 (App Router, standalone build) · Tailwind · Cytoscape.js · jsPDF + html2canvas |
| Knowledge graph | Amazon Neptune (openCypher) — VPC-internal, accessed via API only |
| Search | Amazon OpenSearch Serverless (VECTORSEARCH collection, k-NN HNSW) |
| LLM | Bedrock Converse API — `global.anthropic.claude-sonnet-4-6` (chat/insights), `global.anthropic.claude-haiku-4-5-20251001-v1:0` (8D writer, codegraph community labelling) |
| Auth | Amazon Cognito User Pool (us-east-1) |
| Compute | ECS Fargate (ARM64) · 2 services (api, web) |
| Edge | CloudFront with custom domain + ACM cert |
| Infra | AWS CDK v2 (TypeScript, 6 stacks) |

## Project Structure

```
.
├── api/                  FastAPI backend (12+ scenario routers + ops console)
│   ├── routers/          One per scenario + ops + auth + objects
│   ├── services/         Bedrock agent runner, Neptune, search, KB, memory, …
│   ├── config.py         Settings (env-driven, validated at import)
│   └── main.py           FastAPI app wiring + middleware
├── web/                  Next.js 14 App Router
│   ├── app/              Routes — 12 scenarios + objects/[type] + ops/[area]
│   ├── components/       Sidebar, ScenarioHeader, CytoscapeView, MarkdownView
│   ├── lib/              api-client, persona-context, pdf-export helper
│   └── public/logos/     AWS + 3 demo logos for sidebar preset cycler
├── data/
│   ├── public/           Real-world standards (JEDEC, IPC, AEC-Q, REACH, …)
│   ├── synthetic/        Generators for the 22-class graph (~10k nodes)
│   ├── schemas.py        Pydantic models for the 22 ontology classes
│   └── load_{graph,search}.py  VPC-internal loaders
├── infra-cdk/            AWS CDK v2 — 6 stacks (network/data/compute/ai/edge/observability)
├── scripts/
│   └── label_communities.py  Bedrock-driven community labeller for graphify
├── docs/
│   ├── architecture.md       (created by /sync-docs)
│   ├── decisions/ADR-*.md    (created by /sync-docs)
│   ├── runbooks/*.md         (created by /sync-docs)
│   └── deploy-logs/          Raw deploy snapshots (use runbooks instead)
├── tests/                pytest — services, routers, data generation
├── CHANGELOG.md          v0.x history
├── Makefile              Data generation + Neptune/OS load targets
└── README.md             Public-facing quickstart
```

## Key Commands

```bash
# Local dev (each in its own shell)
cd web && npm install && npm run dev      # Next.js → http://localhost:3000
cd api && uvicorn api.main:app --reload   # FastAPI → http://localhost:8000

# Tests
make test                                  # pytest -v (whole suite)
pytest tests/api/routers/test_eight_d_esg_pdm.py -q   # single router

# Synthetic data regen (writes data/output/*.ndjson)
make data

# Data load into AWS — must run from inside the VPC (bastion / ECS task)
make load                                  # schema + graph + search
make load-schema | load-graph | load-search

# Deploy (build + push + force ECS redeploy)
docker build --platform linux/arm64 -f api/Dockerfile -t <ecr>/ontology-mfg-dev-api:latest .
docker push <ecr>/ontology-mfg-dev-api:latest
aws ecs update-service --cluster ontology-mfg-dev-cluster \
  --service ontology-mfg-dev-api --force-new-deployment

# Code knowledge graph — regenerate after major refactors
graphify update . && python3 scripts/label_communities.py
cp graphify-out/{graph.html,graph.json,GRAPH_REPORT.md,manifest.json,community_labels.json} \
   web/public/codegraph/
```

See [`docs/runbooks/deploy-production.md`](docs/runbooks/deploy-production.md)
for the full deploy procedure with safety checks.

## Conventions

- **Width tiers** — Two-bucket layout system across all 12 scenario pages:
  `max-w-4xl mx-auto` (form-narrow: chat, eight-d, insights, rfm, esg, pdm,
  compliance) and `max-w-7xl mx-auto` (wide-grid: search, spec, substitute,
  price). `/lane`, `/objects/[type]`, `/codegraph` use full-width by design.
- **SSE for long-running Bedrock** — `/chat`, `/eight-d`, `/insights` use
  `EventSourceResponse` with phase / phase_done / delta / result / stop event
  vocabulary. CloudFront origin compression is **disabled** for SSE paths
  (commit `d480108`).
- **Bedrock timeout safety net** — Every Bedrock-backed handler bounds the
  call with `concurrent.futures.ThreadPoolExecutor.submit().result(timeout=25)`
  and falls back to a deterministic template; see `_BEDROCK_BUDGET_S` in
  `api/routers/eight_d.py`.
- **Read-only Cypher gateway** — `_tool_neptune` in `api/routers/chat.py`
  rejects write/destructive Cypher via a regex deny-list before forwarding to
  `run_cypher`. ADR-002 has the rationale; do not weaken without review.
- **Persona** — single `useActivePersona()` context drives 12 scenarios; the
  legacy `(buyer)/(engineer)/...` route groups are dead and unlinked.
- **PDF export** — single helper `web/lib/pdf-export.ts`. Per-page sections
  use `accentColor` for category color-coding. Add new exports there, not
  by inlining jsPDF.
- **Synthetic-fallback pattern** — Every scenario's data path has a
  deterministic synthetic fallback when Neptune / OpenSearch / Bedrock are
  unreachable, so the demo never blanks. Look for `_synthetic` flag in
  responses.
- **Graphify regen** — `graphify update . → label_communities.py → cp` is
  the canonical sequence. Never edit `web/public/codegraph/*` by hand —
  rerun the labeller.

## Non-Obvious Gotchas

- **Next.js standalone + `public/`** — `output: "standalone"` does NOT auto-
  copy `public/`. Dockerfile's `COPY --from=build /app/public ./public` is
  required (commit `812b174`).
- **`web/.next/` in build context** — A stale local `.next/` in the working
  tree poisons docker builds. `.dockerignore` excludes it (commit `d5ba62b`).
- **Cognito LogoutURL exact match** — `logout_uri` must include the trailing
  slash to match the registered URL (commit `eff662d`).
- **Neptune `~start`/`~end` are internal ids, not application ids** — When
  building 1-hop subgraphs in `api/routers/objects.py`, map them through a
  lookup table (commit `262a61a`); otherwise Cytoscape throws on dangling
  edges.
- **AOSS hides version** — `GET /` and `_cluster/health` return 404 by
  design. CloudWatch `AWS/AOSS` namespace has no `EngineVersion` dimension.

## Testing & CI

- `pytest` from project root — no integration AWS calls in unit suites
- TypeScript: `cd web && ./node_modules/.bin/tsc --noEmit` — strict mode
- Bedrock invocations require `VscodeServerStack-VSCode-Role` IAM credentials
  on the dev EC2 host

## Working with Claude Code on This Project

- Long deploys (build + push + ECS rolling) take ~3-5 min total — kick them
  off with `run_in_background: true` and continue with other work, do NOT
  poll
- Two ECR repos: `ontology-mfg-dev-api` and `ontology-mfg-dev-web` in
  `ap-northeast-2`. ECS cluster: `ontology-mfg-dev-cluster`
- After any persona-routed page change, run `tsc --noEmit` because legacy
  `(buyer)/...` routes still import `api.eightD()` etc. as a Promise wrapper
- AOSS / Neptune are VPC-internal — direct curl from the dev EC2 will time
  out. Test through the API container or via `aws ecs execute-command` (if
  enabled)
