# CLAUDE.md

Project memory for Claude Code on **ontology-for-mfg** — a Hi-Tech manufacturing
ontology PoC demo (AMZN Tech, Korean / English UI). Mirrors the sister project
`ontology-for-retail`. Currently at **v0.6.0**.

## Overview

- **Custom domain**: `https://mfg-ontology.whchoi.net` (Cognito-protected)
- **Demo users**: `admin@whchoi.net` / `demo@whchoi.net` — credentials in
  1Password vault `ontology-mfg-demo`
- **Ontology**: 22 classes (Product / Module / Component / RawMaterial /
  Manufacturer / Supplier / SubSupplier / CustomerAccount / Plant / Region /
  TradeLane / Standard / Certification / Regulation / Substance /
  QualityIncident / EightDReport / RootCause / Telemetry / MaintenanceEvent /
  ESGIndicator / CarbonScope) · 27 relationship types — declared once in
  `ontology/registry.py`
- **Personas (5)**: Buyer / Engineer / Quality / SCM / Plant
- **Scenarios (12, A–L)**: A 의미 검색 · B 대화형 에이전트 · C 인사이트 ·
  D 스펙 매치 · E 규제 검증 · F 대체 부품 · G 단가/재고 · H 글로벌 SCM lane ·
  I 협력사 RFM · J 8D / RCA · K ESG / CBAM · L PdM / IoT
- **Standards**: JEDEC · IPC · AEC-Q · IATF 16949 · ISO 9001 · REACH-SVHC ·
  RoHS · CBAM · IRA · USMCA

## Tech Stack

| Layer | Tech |
|-------|------|
| API | FastAPI 0.162 (Python 3.12) · sse-starlette 3.5 · boto3 1.43 · opensearch-py 2.7 · PyJWT |
| Web | Next.js 16 (App Router, standalone, Turbopack) · React 19 · Tailwind · Cytoscape.js · jsPDF + html2canvas |
| Knowledge graph | Amazon Neptune 1.4.8.1 (openCypher) — VPC-internal, accessed via API only; API role is read-only |
| Search | Amazon OpenSearch Serverless (VECTORSEARCH collection, k-NN HNSW, Titan v2 1024-d) |
| LLM | Bedrock Converse API — `global.anthropic.claude-sonnet-5-5` (chat agent, effort via `MFG_SONNET_EFFORT`), `global.anthropic.claude-haiku-4-5-20251001-v1:0` (8D writer, follow-ups, codegraph community labelling) |
| Guardrails | Bedrock Guardrails, STANDARD tier (`apac.guardrail.v1:0` profile) — ADR-011 |
| Auth | Amazon Cognito User Pool (us-east-1, created by EdgeStack) |
| Compute | ECS Fargate (ARM64) · 2 services (api, web) + one-shot loader task |
| Edge | CloudFront with custom domain + ACM cert + Lambda@Edge (nodejs22.x) |
| Infra | AWS CDK v2 (aws-cdk-lib 2.274, TypeScript, 6 stacks) |

## Project Structure

```
.
├── api/                  FastAPI backend (12+ scenario routers + ops console)
│   ├── routers/          One per scenario + ops + auth + objects
│   ├── services/         Bedrock agent runner, guardrails, Neptune, search, KB, memory, …
│   ├── config.py         Settings (env-driven, validated at import)
│   ├── requirements.txt  Exact pins the API image installs
│   └── main.py           FastAPI app wiring + middleware
├── web/                  Next.js 16 App Router (see web/CLAUDE.md)
│   ├── app/              Routes — 12 scenarios + objects/[type] + ops/[area] + /manny popup chat
│   ├── components/       LayoutShell, Sidebar, ScenarioHeader, CytoscapeView, FloatingChat, MarkdownView
│   ├── lib/              api-base (apiUrl), api-client (SSE), persona-context, pdf-export, manny-bridge
│   ├── __tests__/        vitest suites
│   └── public/logos/     AWS + 3 demo logos for sidebar preset cycler
├── ontology/
│   ├── registry.py       SINGLE SOURCE OF TRUTH — 22 NodeSpec + edge rules (Cypher ↔ TTL names)
│   ├── build_ttl.py      Renders schema.ttl from the registry (generated — don't hand-edit)
│   └── upload.py         schema.ttl → Neptune SPARQL (named-graph replace)
├── data/
│   ├── public/           Real-world standards (JEDEC, IPC, AEC-Q, REACH, …)
│   ├── synthetic/        Generators for the 22-class graph (10,844 nodes / 31,119 edges)
│   ├── schemas.py        Pydantic models for the 22 ontology classes
│   └── load_{graph,search}.py  VPC-internal loaders (see data/CLAUDE.md)
├── loader/               One-shot ECS loader image (Dockerfile, run.sh, requirements.txt)
├── infra-cdk/            AWS CDK v2 — 6 stacks (network/data/compute/ai/edge/observability)
├── scripts/
│   ├── label_communities.py  Bedrock-driven community labeller for graphify
│   └── guardrail_probe.py    False-positive probe for the deployed guardrail
├── docs/
│   ├── architecture.md       System design + diagrams
│   ├── decisions/ADR-*.md    ADR-001 … ADR-011
│   ├── runbooks/*.md         Deploy / data load / auth / model swap / SSE / CI / incidents
│   └── deploy-logs/          Raw deploy snapshots (use runbooks instead)
├── tests/                pytest — services, routers, integration, data generation, ontology
│   └── integration/      Contract tests (12-scenario wiring, Pydantic models, graph contract)
├── .github/workflows/    CI — api (pytest + pip-audit + ruff + black) · web (tsc + vitest + audit + build) · cdk (jest + audit)
├── requirements.txt      `-r api/requirements.txt -r loader/requirements.txt` (what CI tests = what ships)
├── pyproject.toml        Python 3.12 floor + ruff/black/mypy/pytest config
├── CHANGELOG.md          v0.x history
├── Makefile              Data generation + Neptune/OS load targets (PYTHON defaults to .venv)
└── README.md             Public-facing quickstart
```

## Key Commands

```bash
# Local dev (each in its own shell)
cd web && npm ci && npm run dev           # Next.js → http://localhost:3000
cd api && uvicorn api.main:app --reload   # FastAPI → http://localhost:8000

# Tests
make test                                  # pytest -v (whole suite, .venv python)
pytest tests/api/routers/test_eight_d_esg_pdm.py -q   # single router
cd web && npm test                         # vitest
cd infra-cdk && npm test                   # CDK Jest invariants

# Synthetic data regen (writes data/output/*.ndjson)
make data
python -m data.load_graph --dry-run        # offline: node/edge counts per label/rel
python -m ontology.build_ttl               # regenerate ontology/schema.ttl after registry edits (pytest fails if stale)

# Data load into AWS — must run from inside the VPC (bastion / ECS task)
make load                                  # schema + graph (--reset) + search (index recreate)
make load-schema | load-graph | load-search

# Deploy — immutable :<git sha> tags via SSM + ComputeStack (EdgeStack first when auth/edge changed)
scripts/deploy.sh                          # build (if new) + push + roll out api & web at HEAD
scripts/deploy.sh --only api               # one service
scripts/deploy.sh --only api --tag <sha>   # rollback to an existing build

# Guardrail false-positive probe — after any ai-stack.ts guardrail change + deploy
python3 scripts/guardrail_probe.py

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
- **SSE for long-running Bedrock** — `/chat` and `/eight-d` use
  `EventSourceResponse` with phase / phase_done / delta / guardrail / result /
  suggested_followups / stop event vocabulary; every stream ends with exactly
  one `stop`. (`/insights` is a plain JSON POST.) CloudFront origin
  compression is **disabled** for SSE paths (commit `d480108`).
- **Follow-up suggestions on /chat** — after every assistant turn, the
  chat router calls `api/services/followups.py` (Haiku 4.5, 300 tokens,
  bounded to 5s) to generate 3 short Korean follow-up questions tuned to the
  active persona's KPI tone. Emitted as a `suggested_followups` SSE event
  before `stop`; failures / timeouts degrade to []. Web UI renders clickable
  chips below the last assistant message.
- **Bedrock timeout safety net** — Every Bedrock-backed handler bounds the
  call with `concurrent.futures.ThreadPoolExecutor.submit().result(timeout=25)`
  and falls back to a deterministic template; see `_BEDROCK_BUDGET_S` in
  `api/routers/eight_d.py`. Bedrock clients (`api/aws_clients.py`) also carry
  a botocore `Config` (connect 5s / read 30s / standard retries ×2) so the
  abandoned worker thread doesn't block for minutes.
- **Guardrails are enforced** — `AgentRunner` checks the user question
  (`ApplyGuardrail` INPUT; blocked → model never called, stop reason
  `guardrail_intervened`) and the final answer (OUTPUT, after streaming).
  Detect-mode topics surface as "탐지(모니터링)" + a log line, API failure
  fails open with a `log` event. After editing topics in `ai-stack.ts`,
  deploy and run `scripts/guardrail_probe.py` (must report 0 benign blocks).
  ADR-011.
- **Read-only Cypher gateway** — `_tool_neptune` in `api/routers/chat.py`
  rejects write/destructive Cypher via a regex deny-list (also on a comment- /
  backtick-normalised copy), clamps `LIMIT` to 100 and truncates results to
  100 rows / 32 KB. The API task role only has `neptune-db:ReadDataViaQuery`
  + `GetQueryStatus`. ADR-002; do not weaken without review.
- **Ontology registry is the contract** — labels, relationship types and
  their direction live in `ontology/registry.py`; the loader, `schema.ttl`,
  the chat system prompt (`registry.schema_hint()`) and the synthetic object
  subgraphs all derive from it. A new label / rel / property read by API
  Cypher must exist there, or `tests/integration/test_graph_contract.py`
  fails. List props (standards, substances, regulations) are stored
  comma-joined — read them with `api.services.neptune.list_prop()`.
- **Persona** — single `useActivePersona()` context drives 12 scenarios.
  Legacy `(buyer)/(engineer)/(quality)/(scm)/(plant)` route groups were
  removed in v0.5.2 (commit `8567070`). Do not reintroduce per-persona route
  directories — the active persona is a runtime concern, not a routing one.
- **PDF export** — single helper `web/lib/pdf-export.ts`. Per-page sections
  use `accentColor` for category color-coding. Add new exports there, not
  by inlining jsPDF.
- **Synthetic-fallback pattern** — Every scenario's data path has a
  deterministic synthetic fallback when Neptune / OpenSearch / Bedrock are
  unreachable (incl. `NEPTUNE_ENDPOINT` unset), so the demo never blanks.
  Look for `_synthetic` flag in responses.
- **Dependency pins** — `api/requirements.txt` and `loader/requirements.txt`
  are the exact pins the images install; root `requirements.txt` only
  includes them. Bump there, never in the Dockerfiles.
- **Graphify regen** — `graphify update . → label_communities.py → cp` is
  the canonical sequence. Never edit `web/public/codegraph/*` by hand —
  rerun the labeller.

## Non-Obvious Gotchas

- **Sonnet 5.5 request shape** — it rejects `temperature` (and other sampling
  params); thinking is on by default and counts toward `maxTokens` (chat uses
  8192). Reasoning blocks must be replayed unchanged (signature included) in
  the tool loop — `agent.py` rebuilds blocks in stream order. Effort goes in
  `additionalModelRequestFields.output_config.effort`.
- **Deploy EdgeStack before an API image that changes auth** — `/callback`
  returns 400 without a matching OAuth `state`; only the current Lambda@Edge
  (redirect → `/api/auth/login`) issues one.
- **Neptune major versions** — never cross a major (e.g. 1.4 → 1.5) through
  CloudFormation. Snapshot, upgrade with the CLI, then align `engineVersion`
  in `data-stack.ts`. The cluster has `DeletionPolicy: Snapshot`.
- **`make load-graph` is a full reload** — it runs `--reset` (DETACH DELETE of
  all registry labels) before loading; `load-search` recreates the index
  (AOSS VECTORSEARCH auto-assigns `_id`, upserts by id are impossible).
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

## Version strings (release sync targets)

When bumping the version, **these three files must be updated together**
— otherwise the deployed UI keeps showing the old version even though
CHANGELOG/git-tag advanced:

| File | Pattern |
|------|---------|
| `pyproject.toml` | `version = "x.y.z"` |
| `api/main.py` | `FastAPI(title="ontology-mfg api", version="x.y.z")` |
| `web/components/Sidebar.tsx` | `Hi-Tech Demo · vx.y.z` (around line 117) |

The `release` skill's "Sync runtime version strings" step targets exactly
these. After updating, container redeploy is required for users to see
the new version (see `docs/runbooks/deploy-production.md`).

## Testing & CI

- `pytest` from project root — no integration AWS calls in unit suites
  (369 tests at v0.6.0; web vitest 63; cdk Jest 36)
- `tests/integration/` — cross-cutting contract tests (12-scenario wiring,
  Pydantic `response_model` coverage, graph contract); runs in the same
  suite, no AWS needed
- TypeScript: `cd web && ./node_modules/.bin/tsc --noEmit` — strict mode
- GitHub Actions (`.github/workflows/ci.yml`) — api/web/cdk parallel jobs on
  push/PR to main, Node 24. **ruff + black are blocking**; `pip-audit` on the
  shipped pins; `npm audit --audit-level=high` (web `--omit=dev`, cdk).
  Mirror locally with `make test && ruff check . && black --check .` and
  `cd web && tsc --noEmit && npm test`
- Bedrock invocations require `VscodeServerStack-VSCode-Role` IAM credentials
  on the dev EC2 host
- **Python 3.12 only** — `pyproject.toml` declares `requires-python = ">=3.12"`.
  AL2023: `sudo dnf install -y python3.12` then `make venv` for the dev venv.

## Working with Claude Code on This Project

- Long deploys (build + push + ECS rolling) take ~3-5 min total — kick them
  off with `run_in_background: true` and continue with other work, do NOT
  poll
- Two ECR repos: `ontology-mfg-dev-api` and `ontology-mfg-dev-web` in
  `ap-northeast-2`. ECS cluster: `ontology-mfg-dev-cluster`
- AOSS / Neptune are VPC-internal — direct curl from the dev EC2 will time
  out. Test through the API container or via `aws ecs execute-command` (if
  enabled)
- The "Manny" floating chatbot (`web/components/FloatingChat.tsx`) opens the
  chrome-less `/manny` route — into a popup window on Firefox/Safari, into
  an in-page iframe modal on Chromium. Both surfaces use the same
  `/api/chat` SSE backend. See ADR-010.
