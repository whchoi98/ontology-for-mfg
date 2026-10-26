# ontology-mfg

Hi-Tech manufacturing ontology PoC — Korean / English UI. Bedrock-driven
agentic AI on top of a 22-class Knowledge Graph (Neptune) with hybrid
semantic search (OpenSearch Serverless), running on AWS Fargate behind
CloudFront.

**Live demo**: [https://mfg-ontology.whchoi.net](https://mfg-ontology.whchoi.net)
(Cognito-protected — credentials via the project owner)

## What it does

- **12 scenarios** (A–L) covering the manufacturing lifecycle: 의미 검색,
  대화형 에이전트, 인사이트, 스펙 매치, 규제 검증, 대체 부품, 단가/재고
  비교, 글로벌 SCM lane reroute, 협력사 RFM, 8D / RCA, ESG / CBAM,
  PdM / IoT
- **22 ontology classes / 27 relationship types**, declared once in
  `ontology/registry.py` — BOM hierarchy (Product / Module / Component /
  RawMaterial), supply chain (Manufacturer / Supplier / Plant / TradeLane),
  standards (JEDEC / IPC / AEC-Q / IATF / ISO / REACH / RoHS / CBAM / IRA /
  USMCA), quality (Incident / 8D / RootCause), operations (Telemetry /
  Maintenance / ESG / Carbon)
- **5 personas** — Buyer / Engineer / Quality / SCM / Plant; same scenario
  surfaces different framings per persona
- **Agentic AI** — Claude Sonnet 5.5 on Bedrock `converse_stream` with
  tool-use across `search_semantic`, `neptune_query` (read-only gateway),
  `kb_retrieve`, `compliance_check`, `memory_save`; token-level SSE
  streaming with persona-tuned follow-up question chips after every turn
  (Haiku 4.5)
- **Guardrails** — Bedrock Guardrails (STANDARD tier, Korean-capable)
  screen every question before the model runs and every answer after it
  streams
- **"Manny" floating chatbot** — bottom-right launcher on every page;
  opens as a popup window (Firefox / Safari) or in-page iframe modal
  (Chromium) targeting the chrome-less `/manny` route
- **PDF export** on chat / 8D / insights / spec / lane scenarios via a
  shared `web/lib/pdf-export.ts` helper

## Tech Stack

| Layer | Tech |
|-------|------|
| API | FastAPI 0.162 on Python 3.12 (`pyproject.toml` requires-python>=3.12) · sse-starlette · boto3 · PyJWT |
| Web | Next.js 16 (App Router, standalone) · React 19 · Tailwind CSS 4 · Cytoscape.js |
| LLM | Bedrock Converse — Sonnet 5.5 (chat agent) + Haiku 4.5 (8D, follow-ups, codegraph) · Bedrock Guardrails |
| Graph | Amazon Neptune 1.4.8.1 (openCypher, VPC-internal) |
| Search | Amazon OpenSearch Serverless (VECTORSEARCH, k-NN HNSW) |
| Auth | Amazon Cognito |
| Compute | ECS Fargate ARM64 |
| Edge | CloudFront + ACM custom domain |
| Infra | AWS CDK v2 (TypeScript, 6 stacks) |

## Repo layout

```
api/         FastAPI backend (12+ routers, ops console, SSE streams)
web/         Next.js 16 App Router (12 scenarios, /manny popup, PDF export)
ontology/    Graph contract registry (SSOT) + generated schema.ttl
data/        Synthetic generators + standards loaders + schemas
loader/      One-shot ECS loader image (schema → graph → search)
infra-cdk/   AWS CDK (network/data/compute/ai/edge/observability)
scripts/     graphify community labeller · guardrail false-positive probe
docs/        architecture · ADRs · runbooks · deploy logs
tests/       pytest — services, routers, integration, data
.github/     GitHub Actions CI (api / web / cdk parallel jobs)
pyproject.toml  Python 3.12 floor + ruff/black/mypy/pytest config
```

## Local development

```bash
# Prerequisites: Python 3.12, Node 24, AWS CLI configured for dev account
# AL2023: sudo dnf install -y python3.12
make venv                       # python3.12 -m venv .venv + pip install
source .venv/bin/activate
make data                       # Regenerate synthetic ndjson under data/output/
cd web && npm ci && npm run dev         # http://localhost:3000
cd api && uvicorn api.main:app --reload  # http://localhost:8000
make test                       # pytest suite
cd web && npm test              # vitest
```

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — Project memory for Claude Code
- [`CHANGELOG.md`](CHANGELOG.md) — Versioned change log
- [`docs/architecture.md`](docs/architecture.md) — System design + diagrams
- [`docs/decisions/`](docs/decisions/) — Architecture Decision Records
- [`docs/runbooks/`](docs/runbooks/) — Operational procedures (deploy, data
  load, incident response, model swap, auth)
- [`docs/superpowers/specs/2026-05-05-ontology-mfg-hitech-design.md`](docs/superpowers/specs/2026-05-05-ontology-mfg-hitech-design.md)
  — Original design spec (point-in-time)

## License

Internal demo. AMZN Tech / 한국 Hi-Tech 데모 — 합성 데이터, 실제 협력사·
부품 정보 미포함.
