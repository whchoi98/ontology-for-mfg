# Architecture — ontology-for-mfg

## System Overview

ontology-for-mfg is a Hi-Tech manufacturing ontology PoC that turns 22
ontology classes (BOM hierarchy + supply chain + standards + quality +
operations / ESG) into 12 agentic-AI scenarios surfaced through a
dark-theme Next.js dashboard. The engine layer combines Amazon Neptune
(openCypher knowledge graph), Amazon OpenSearch Serverless (hybrid
BM25 + k-NN search), and Amazon Bedrock (Sonnet 4.6 for chat / insights,
Haiku 4.5 for 8D + community labelling). Everything runs on ECS Fargate
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
- `data/load_graph.py` / `data/load_search.py` — VPC-internal loaders
  pushing ndjson into Neptune (openCypher bulk) and OpenSearch (`_bulk`).

### Storage
- **Amazon Neptune** (Serverless) — knowledge graph, openCypher access.
  22-class label allowlist enforced server-side.
- **Amazon OpenSearch Serverless** — `ontology-mfg-dev-search`
  collection, type `VECTORSEARCH`. Korean Nori analyzer for BM25 +
  k-NN HNSW for 1024-d Titan embeddings.
- **Aurora Serverless** — AgentCore Memory backing store
  (DynamoDB-shaped per-session facts table `ontology-mfg-dev-memory`).
- **Bedrock Knowledge Base** — datasheet / 8D / regulation passages.
- **S3** — synthetic ndjson archives + Bedrock KB source bucket.

### Processing / AI
- `api/services/agent.py` — `AgentRunner` driving Bedrock Converse with
  tool-use loop (max 8 rounds). Emits `phase / delta / tool_call /
  tool_result / guardrail / log / error / stop` SSE events. 200-deep
  trace ring buffer powers `/api/ops/trace`.
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
- FastAPI (Python 3.12) — 16 routers (12 scenarios A–L + objects + ops +
  auth + health). SSE for chat / 8D / insights / search streaming.
- Cypher gateway hardening:
  - 22-class **label allowlist** (`api/routers/objects.py`) — Cypher
    can't parameterize labels, so any user-provided label is validated
    against `_ALLOWED_LABELS`.
  - **Read-only Cypher deny-list** (`api/routers/chat.py:_tool_neptune`)
    — regex blocks CREATE / DELETE / DETACH DELETE / SET / REMOVE /
    MERGE / DROP / FOREACH / LOAD CSV / CALL db./dbms./apoc.write.
    ADR-002.

### Presentation / Web
- Next.js 14 App Router (standalone build, ARM64). Tailwind dark theme,
  Cytoscape.js for graphs, react-markdown for streamed prose.
- 12 scenario pages + 22-class object explorer (`/objects/[type]`) +
  5-area ops console (`/ops/[area]`) + code knowledge graph
  (`/codegraph`) + meta pages (schema / standards / validation).
- Shared `web/lib/pdf-export.ts` — A4 export pipeline used by chat /
  8D / insights / spec / lane.
- Persona context (`useActivePersona()`) drives per-persona framings on
  same routes; legacy `(buyer)/...` route groups are dead.

### Observability
- CloudWatch logs — `/aws/ecs/ontology-mfg-dev-api` consumed by
  `/api/ops/guardrail` for guardrail intervention surfacing.
- CloudWatch metrics — namespace `AWS/AOSS` for OpenSearch + custom
  application metrics.
- `/api/ops/eval` — 30-query mfg-domain wow query scoreboard,
  re-runnable on demand.
- `/api/ops/trace` — last 200 tool_call events from the in-process
  ring buffer.

### Security
- Amazon Cognito (User Pool `us-east-1_zQZZJRYer`) — email + OpenID
  scopes. SameSite=Lax cookie, JWT verification on the API
  middleware.
- Bedrock Guardrails — 4-topic mfg-specific config (IPConfidential /
  CompetitorDisparagement / RegulationViolation / HazardousChemical).
  ID `356xcbgyqcpq`.
- KMS-CMK encryption on AOSS + Aurora + Secrets Manager.
- VPC isolation — Neptune private subnets only, AOSS data-access policy
  scoped to API task role.

## Full Architecture Diagram

```
                        ┌──────────────────────────────────────────────┐
                        │            Browser  ←  Cognito Hosted UI    │
                        └──────────────────────┬───────────────────────┘
                                               │ HTTPS
                                               ▼
                       ┌────────────────────────────────────────────┐
                       │  CloudFront  (mfg-ontology.whchoi.net)     │
                       │  ACM cert (us-east-1) · SSE compression OFF│
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
                │  · Cypher deny-list        │
                └──┬──────────┬──────────┬───┘
                   │          │          │
                   ▼          ▼          ▼
            ┌────────┐  ┌──────────┐  ┌────────────┐
            │Neptune │  │ AOSS     │  │  Bedrock   │
            │ open-  │  │ BM25+KNN │  │ Sonnet 4.6 │
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
| `data-stack.ts` | Neptune cluster · AOSS collection · Aurora · Secrets Manager · KMS | network |
| `ai-stack.ts` | Bedrock KB · Cognito User Pool · Guardrail config | data |
| `compute-stack.ts` | ECR repos · ECS cluster · Api/Web services · ALB · IAM task roles | network, data, ai |
| `edge-stack.ts` | CloudFront · ACM (us-east-1) · Lambda@Edge | compute |
| `observability-stack.ts` | CloudWatch alarms · log groups · dashboards | compute |

### ECS Services

| Service | Image | Desired | Task role |
|---------|-------|---------|-----------|
| `ontology-mfg-dev-api` | `ontology-mfg-dev-api:latest` (ARM64) | 2 | Bedrock + Neptune + AOSS + KB + Cognito |
| `ontology-mfg-dev-web` | `ontology-mfg-dev-web:latest` (ARM64) | 2 | minimal |

## Bedrock Model Routing

| Use case | Model id | Why |
|----------|----------|-----|
| `/api/chat` (B), `/api/insights` (C), tool-use orchestrator | `global.anthropic.claude-sonnet-4-6` | Need long-form Korean reasoning + multi-round tool calls |
| `/api/eight-d` writer (J) | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | Schema-enforced 8 string fields; 2.5–3× faster than Sonnet (ADR-001) |
| `scripts/label_communities.py` | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | 188 short labels; cost + latency win |
| Embeddings | `amazon.titan-embed-text-v2:0` | 1024-d, ap-northeast-2 native |
| Reranker | (env-disabled in current deploy) | Not GA in ap-northeast-2 |

## Key Design Decisions

See [`docs/decisions/`](decisions/) for full ADRs. Headlines:

- **ADR-001** — Bedrock model split: Sonnet 4.6 for chat / insights, Haiku
  4.5 for structured-output writers (8D, community labels)
- **ADR-002** — Read-only Cypher gateway via regex deny-list
  (defense-in-depth against prompt-injection)
- **ADR-003** — SSE for long-running Bedrock calls + 25s in-process
  timeout + deterministic fallback
- **ADR-004** — graphify code knowledge graph as same-origin iframe
  (vs server-rendered)
- **ADR-005** — jsPDF + html2canvas client-side PDF (vs server render)
- **ADR-006** — Neptune internal-id → application-id mapping in subgraph
  builders
- **ADR-007** — CloudFront origin-response compression disabled for SSE
- **ADR-008** — 22-class ontology + 12-scenario A–L taxonomy

## Operations

- **Deploy**: [`docs/runbooks/deploy-production.md`](runbooks/deploy-production.md)
- **Data load**: [`docs/runbooks/data-load.md`](runbooks/data-load.md)
- **Incident response**: [`docs/runbooks/incident-response.md`](runbooks/incident-response.md)
- **Bedrock model swap**: [`docs/runbooks/bedrock-model-swap.md`](runbooks/bedrock-model-swap.md)
- **Auth (Cognito)**: [`docs/runbooks/auth-cognito.md`](runbooks/auth-cognito.md)
