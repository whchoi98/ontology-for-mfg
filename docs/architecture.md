# Architecture — ontology-for-mfg

## System Overview

ontology-for-mfg is a Hi-Tech manufacturing ontology PoC that turns 22
ontology classes (BOM hierarchy + supply chain + standards + quality +
operations / ESG) into 12 agentic-AI scenarios surfaced through a
dark-theme Next.js dashboard. The engine layer combines Amazon Neptune
(openCypher knowledge graph), Amazon OpenSearch Serverless (hybrid
BM25 + k-NN search), and Amazon Bedrock (Claude Sonnet 5.5 for the chat
agent, Haiku 4.5 for 8D / follow-ups / community labelling, Bedrock
Guardrails on chat input + output). Everything runs on ECS Fargate
ARM64 behind a Cognito-protected CloudFront distribution at
`https://mfg-ontology.whchoi.net`.

## Components by Layer

### Ingestion
- `data/synthetic/*.py` — deterministic generators for the 22-class graph
  (Product / Module / Component / Supplier / Plant / TradeLane /
  QualityIncident / Telemetry / ESG / …). Runs locally via `make data`,
  emits ndjson under `data/output/`.
- `data/public/*.py` — frozen real-world standards subsets (JEDEC, IPC,
  AEC-Q, IATF 16949, ISO 9001/26262, REACH-SVHC, RoHS, CBAM, IRA, USMCA).
- `ontology/registry.py` — **single source of truth** for the graph
  contract: 22 `NodeSpec`s + edge derivation rules (27 relationship types,
  Cypher UPPER_SNAKE ↔ TTL camelCase). `ontology/schema.ttl` is generated
  from it (`python -m ontology.build_ttl`).
- `data/load_graph.py` / `data/load_search.py` — VPC-internal loaders, run
  by the one-shot ECS loader task (`loader/run.sh`). The graph loader builds
  all 22 labels + FK-derived edges from the registry and posts
  `UNWIND … MERGE` batches over openCypher (`--reset` wipes registry labels
  first): 10,844 nodes / 31,119 edges from the synthetic dataset. The search
  loader embeds components (Titan v2, 1024-d) and recreates the index
  (`_bulk`, AOSS auto-ids).

### Storage
- **Amazon Neptune** (Serverless, engine 1.4.8.1, `DeletionPolicy:
  Snapshot`) — knowledge graph, openCypher access. 22-class label allowlist
  enforced server-side; list properties (standards / substances /
  regulations) stored comma-joined.
- **Amazon OpenSearch Serverless** — `ontology-mfg-dev-search`
  collection, type `VECTORSEARCH`. Korean Nori analyzer for BM25 +
  k-NN HNSW for 1024-d Titan embeddings.
- **Aurora Serverless** — AgentCore Memory backing store
  (DynamoDB-shaped per-session facts table `ontology-mfg-dev-memory`).
- **Bedrock Knowledge Base** — datasheet / 8D / regulation passages.
  Created post-deploy (needs the AOSS vector index first); CDK provisions
  only its IAM role + data access policy.
- **S3** — synthetic ndjson archives + Bedrock KB source bucket.

### Processing / AI
- `api/services/agent.py` — `AgentRunner` driving Bedrock **`converse_stream`**
  on Claude Sonnet 5.5 with tool-use loop (max 8 rounds). `maxTokens` 8192
  (thinking counts), no `temperature`, effort via
  `additionalModelRequestFields.output_config.effort` (`MFG_SONNET_EFFORT`,
  default `low`); reasoning blocks are replayed unchanged across tool
  rounds. Token-level streaming: every `contentBlockDelta` text chunk is
  forwarded as its own SSE `delta` event the moment it arrives (ADR-009).
  Emits `phase / delta / tool_call / tool_result / guardrail / log /
  suggested_followups / error / stop` SSE events. Tool results are capped at
  40 KB. 200-deep trace ring buffer powers `/api/ops/trace`. Pydantic
  discriminator union in `api/schemas/sse.py`.
- `api/services/guardrails.py` — `check()` → `GuardrailVerdict`. The agent
  runs `ApplyGuardrail` on the user question (blocked → model never called,
  `stop: guardrail_intervened`) and on the full answer after streaming.
  Detect-mode topics are logged, failures fail open with a `log` event
  (ADR-011).
- `api/services/followups.py` — Haiku 4.5 per-turn follow-up question
  generator. 300 tokens, bounded to 5s, persona-tuned (KPI tone map for each
  of buyer / engineer / quality / scm / plant). Failures degrade to `[]`.
- `api/aws_clients.py` — cached boto3 factories; Bedrock clients use a
  botocore `Config` (connect 5s / read 30s / standard retries ×2) under the
  25s in-process budget (ADR-003).
- `api/services/eight_d_writer.py` — Haiku 4.5 tool-use 8D draft
  (8 required string fields), `maxTokens=1500`. ADR-001 explains model
  choice.
- `api/services/search.py` — hybrid BM25 + KNN with RRF fusion in
  Python (AOSS doesn't ship the search-pipeline module).
- `api/services/lane_router.py` / `rfm_scorer.py` / `carbon_calc.py` /
  `compliance_engine.py` — domain-specific deterministic engines.
- `scripts/label_communities.py` — Bedrock Haiku community labeller for
  the graphify code knowledge graph (188 communities × Korean 2–5 word
  names).

### Query / API
- FastAPI 0.162 (Python 3.12) — 16 routers (12 scenarios A–L + objects +
  ops + auth + health). SSE for chat / 8D; the other scenarios are JSON.
- Cypher gateway hardening:
  - 22-class **label allowlist** (`api/routers/objects.py`) — Cypher
    can't parameterize labels, so any user-provided label is validated
    against `_ALLOWED_LABELS`.
  - **Read-only Cypher deny-list** (`api/routers/chat.py:_tool_neptune`)
    — regex blocks CREATE / DELETE / DETACH DELETE / SET / REMOVE /
    MERGE / DROP / FOREACH / LOAD CSV / CALL db./dbms./apoc.write, on the
    raw text and a comment-/backtick-normalised copy; `LIMIT` clamped to
    100, results truncated at 100 rows / 32 KB. ADR-002.
  - **IAM read-only** — the API task role holds only
    `neptune-db:ReadDataViaQuery` + `neptune-db:GetQueryStatus`.
  - **Graph contract test** (`tests/integration/test_graph_contract.py`) —
    every label / relationship / property the API's Cypher reads must be
    produced by the registry-driven loader. The chat system prompt embeds
    `registry.schema_hint()`.

### Presentation / Web
- Next.js 16 App Router + React 19 (Turbopack, standalone build, ARM64,
  `node:24-slim`). Tailwind dark theme, Cytoscape.js for graphs,
  react-markdown for streamed prose. API URLs via `apiUrl()`
  (`web/lib/api-base.ts`).
- 12 scenario pages + 22-class object explorer (`/objects/[type]`) +
  5-area ops console (`/ops/[area]`) + code knowledge graph
  (`/codegraph`) + meta pages (schema / standards / validation).
- **"Manny" floating chatbot** (`web/components/FloatingChat.tsx`,
  v0.5.4) — bottom-right launcher on every page; UA-branches to popup
  window (Firefox / Safari) or in-page iframe modal (Chromium) targeting
  the chrome-less `/manny` route (ADR-010).
- `web/app/manny/page.tsx` — chrome-less popup chat surface with inline
  persona switcher, 5-per-persona sample queries, follow-up chips, and
  the same `/api/chat` SSE backend as `/chat`.
- `web/components/LayoutShell.tsx` — client-side chrome dispatcher.
  Hides Sidebar / top bar / FloatingChat on the `/manny` path; renders
  the standard 3-zone shell elsewhere.
- Shared `web/lib/pdf-export.ts` — A4 export pipeline used by chat /
  8D / insights / spec / lane; rasterizes block-wise so long documents
  stay under browser canvas limits.
- Persona context (`useActivePersona()`) drives per-persona framings on
  same routes; legacy `(buyer)/...` route groups were removed in v0.5.2.

### Observability
- CloudWatch logs — `/aws/ecs/ontology-mfg-dev-api` consumed by
  `/api/ops/guardrail` for guardrail interventions and detect-mode
  (monitoring) hits.
- CloudWatch metrics — namespace `AWS/AOSS` for OpenSearch + custom
  application metrics.
- `/api/ops/eval` — 30-query mfg-domain wow query scoreboard,
  re-runnable on demand (DynamoDB-persisted history with 90-day TTL,
  `ThreadPoolExecutor(max_workers=8)` parallelism — v0.5.0).
- `/api/ops/trace` — last 200 tool_call events from the in-process
  ring buffer.

### CI / CD
- `.github/workflows/ci.yml` — 3 parallel jobs on push / PR to main
  (Node 24):
  - **api** — `pytest -v` on Python 3.12 + `pip-audit` on the shipped pins
    (`requirements.txt` → `api/` + `loader/requirements.txt`) + `ruff
    check` + `black --check` (both blocking)
  - **web** — `npm ci` + `tsc --noEmit` strict + vitest + `npm audit
    --omit=dev --audit-level=high` + `next build` (standalone)
  - **cdk** — `npm test` Jest invariant suite (IAM scope incl. Neptune
    read-only, CloudFront SSE compression, guardrail tier / topic modes,
    Lambda@Edge runtime) + `npm audit --audit-level=high`
- Image deploy is manual: `scripts/deploy.sh` → `docker build` →
  ECR push of an immutable `:<git sha>` tag → SSM
  `/ontology-mfg-dev/image-tag/{api,web}` → `cdk deploy` ComputeStack (new
  task definition revision, circuit-breaker rollback). See
  `docs/runbooks/deploy-production.md`.

### Security
- Amazon Cognito (User Pool `us-east-1_zQZZJRYer`, created by EdgeStack)
  — email + OpenID scopes, authorization-code flow with OAuth `state`
  (`mfg_oauth_state` cookie). Lambda@Edge redirects viewers without the
  `mfg_id_token` cookie (SameSite=Lax, HttpOnly) to `/api/auth/login`. The
  API middleware verifies the ID token with PyJWT: RS256 signature + `exp`
  + `iss` + `aud` (app client id) + `token_use=id`.
- Bedrock Guardrails — 4-topic mfg-specific config, STANDARD tier via the
  `apac.guardrail.v1:0` profile. IPConfidential / CompetitorDisparagement
  block; RegulationViolation / HazardousChemical detect-only; MISCONDUCT
  input LOW / output HIGH. ID `356xcbgyqcpq`. ADR-011.
- KMS-CMK encryption on AOSS + Aurora + Secrets Manager.
- VPC isolation — Neptune private subnets only; API task role read-only on
  Neptune. AOSS data-access policy principals (KB, loader, API task roles)
  declared in IaC.

## Full Architecture Diagram

```
                        ┌──────────────────────────────────────────────┐
                        │            Browser  ←  Cognito Hosted UI    │
                        └──────────────────────┬───────────────────────┘
                                               │ HTTPS
                                               ▼
                       ┌────────────────────────────────────────────┐
                       │  CloudFront  (mfg-ontology.whchoi.net)     │
                       │  ACM cert · SSE compression OFF · L@Edge   │
                       └─────────────┬─────────────────┬────────────┘
                                     │ /api/*          │ /
                                     ▼                 ▼
                ┌────────────────────────────┐  ┌────────────────────┐
                │  ALB (ap-northeast-2)      │  │  ECS Web (Next.js) │
                │  /api/auth/* exempt        │  │  2× Fargate ARM64  │
                └─────────────┬──────────────┘  └────────────────────┘
                              │
                              ▼
                ┌────────────────────────────┐
                │  ECS API (FastAPI)         │
                │  2× Fargate ARM64          │
                │  · 16 routers              │
                │  · AgentRunner / SSE       │
                │  · Guardrail in/out checks │
                │  · Cypher deny-list (RO)   │
                └──┬──────────┬──────────┬───┘
                   │          │          │
                   ▼          ▼          ▼
            ┌────────┐  ┌──────────┐  ┌────────────┐
            │Neptune │  │ AOSS     │  │  Bedrock   │
            │ open-  │  │ BM25+KNN │  │ Sonnet 5.5 │
            │ Cypher │  │ Korean   │  │ Haiku 4.5  │
            │ 22 cls │  │ Nori     │  │ KB · GR    │
            └────┬───┘  └────┬─────┘  └─────┬──────┘
                 │           │              │
                 ▼           ▼              ▼
            ┌──────────────────────────────────┐
            │   CloudWatch + AOSS metrics      │
            │   (consumed by /api/ops/*)       │
            └──────────────────────────────────┘
```

## Data Flow Summary

```
User → CloudFront → ALB → API → (Neptune ∪ AOSS ∪ Bedrock) → SSE → Web → User
                                       │
                                       └→ CloudWatch / trace ring → /api/ops/trace
```

## Infrastructure Tables

### CDK Stacks (`infra-cdk/lib/*`)

| Stack | Resources | Key cross-deps |
|-------|-----------|----------------|
| `network-stack.ts` | VPC reuse from ontology-retail (cross-imported via SSM) | none |
| `data-stack.ts` | Neptune 1.4.8.1 cluster · AOSS collection · Aurora · S3 · Secrets Manager · KMS | network |
| `ai-stack.ts` | Bedrock Guardrail (STANDARD) · KB IAM role · AOSS data access policy (KB itself post-deploy) | data |
| `compute-stack.ts` | ECR repos · ECS cluster · Api/Web services · ALB · IAM task roles | network, data, ai (guardrail-id export) |
| `edge-stack.ts` | Cognito User Pool + client + domain · CloudFront · ACM (us-east-1) · Lambda@Edge (nodejs22.x) | compute |
| `observability-stack.ts` | CloudWatch alarms · log groups · dashboards | compute |

### ECS Services

| Service | Image | Desired | Task role |
|---------|-------|---------|-----------|
| `ontology-mfg-dev-api` | `ontology-mfg-dev-api:<git sha>` (ARM64, tag from SSM) | 2 | Bedrock (incl. ApplyGuardrail) + Neptune read-only + AOSS + Secrets Manager |
| `ontology-mfg-dev-web` | `ontology-mfg-dev-web:<git sha>` (ARM64, tag from SSM) | 2 | minimal |

## Bedrock Model Routing

| Use case | Model id | Why |
|----------|----------|-----|
| `/api/chat` (B) — `AgentRunner` tool-use orchestrator (also Manny) | `global.anthropic.claude-sonnet-5-5` (effort `low`) | Long-form Korean reasoning + multi-round tool calls; global profile only |
| `/api/eight-d` writer (J) | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | Schema-enforced 8 string fields; 2.5–3× faster than Sonnet (ADR-001) |
| `/api/chat` follow-up chips | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | 300-token single shot, 5s budget |
| Chat input / output screening | Bedrock Guardrail `356xcbgyqcpq` (STANDARD, `apac.guardrail.v1:0`) | Korean-capable tier (ADR-011) |
| `scripts/label_communities.py` | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | 188 short labels; cost + latency win |
| Embeddings (query + loader documents) | `amazon.titan-embed-text-v2:0` | 1024-d, ap-northeast-2 native |
| Reranker | (env-disabled in current deploy) | Not GA in ap-northeast-2 |

## Key Design Decisions

See [`docs/decisions/`](decisions/) for full ADRs. Headlines:

- **ADR-001** — Bedrock model split: Sonnet for the chat agent (Sonnet 5.5
  since v0.6.0), Haiku 4.5 for structured-output writers (8D, follow-ups,
  community labels)
- **ADR-002** — Read-only Cypher gateway via regex deny-list + row caps,
  backed by a read-only Neptune IAM policy (defense-in-depth against
  prompt-injection)
- **ADR-003** — SSE for long-running Bedrock calls + 25s in-process
  timeout + deterministic fallback
- **ADR-004** — graphify code knowledge graph as same-origin iframe
  (vs server-rendered)
- **ADR-005** — jsPDF + html2canvas client-side PDF (vs server render)
- **ADR-006** — Neptune internal-id → application-id mapping in subgraph
  builders
- **ADR-007** — CloudFront origin-response compression disabled for SSE
- **ADR-008** — 22-class ontology + 12-scenario A–L taxonomy
- **ADR-009** — Token-level Bedrock streaming via `converse_stream` (v0.5.6)
- **ADR-010** — UA-branching popup vs iframe-modal for the Manny floating
  chatbot launcher (v0.5.5)
- **ADR-011** — Guardrail policy: real input/output checks, STANDARD tier,
  block vs detect-only topic modes, probe-measured (v0.6.0)

## Operations

- **Deploy**: [`docs/runbooks/deploy-production.md`](runbooks/deploy-production.md)
- **Data load**: [`docs/runbooks/data-load.md`](runbooks/data-load.md)
- **Incident response**: [`docs/runbooks/incident-response.md`](runbooks/incident-response.md)
- **Bedrock model swap**: [`docs/runbooks/bedrock-model-swap.md`](runbooks/bedrock-model-swap.md)
- **Auth (Cognito)**: [`docs/runbooks/auth-cognito.md`](runbooks/auth-cognito.md)
- **SSE troubleshooting**: [`docs/runbooks/sse-troubleshooting.md`](runbooks/sse-troubleshooting.md)
- **CI pipeline**: [`docs/runbooks/ci-pipeline.md`](runbooks/ci-pipeline.md)
