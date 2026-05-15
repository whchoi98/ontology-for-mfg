# api/CLAUDE.md

FastAPI backend for the 12 manufacturing scenarios + ops console + auth.

## Role

- One router per scenario (A–L), each backed by Neptune (openCypher) and/or
  OpenSearch (BM25 + KNN), with Bedrock Converse for the agentic flows
- SSE streaming for long-running flows (chat, 8D, insights) so the UI can
  render live phase chips
- Synthetic-fallback pattern everywhere: when Neptune / OpenSearch / Bedrock
  is unreachable, deterministic templates keep the demo from blanking

## Layout

```
api/
├── main.py                  FastAPI app + middleware wiring
├── config.py                Settings (env-driven, validated at import)
├── aws_clients.py           Lazy boto3 client factories
├── middleware_auth.py       Cognito id_token cookie verifier
├── Dockerfile               linux/arm64 python:3.12-slim
├── routers/
│   ├── chat.py              B — Bedrock converse_stream + tool-use SSE + suggested_followups
│   ├── search.py            A — hybrid BM25+KNN with Cohere reranker
│   ├── insights.py          C — Neptune aggregates + Sonnet streaming
│   ├── spec_match.py        D — req → candidates + standards subgraph
│   ├── compliance.py        E — REACH/RoHS/AEC-Q deterministic engine
│   ├── substitute.py        F — same-fn + shared-standard alternatives
│   ├── price.py             G — multi-supplier price/lead-time matrix
│   ├── scm_lane.py          H — TradeLane + IRA/USMCA/CBAM reroute
│   ├── supplier_rfm.py      I — RFM scoring with tier weighting
│   ├── eight_d.py           J — SSE: Neptune→KB→Bedrock 8D writer (Haiku)
│   ├── esg_cbam.py          K — Scope 1/2/3 + CBAM 환산
│   ├── pdm.py               L — Telemetry threshold alarms + recos
│   ├── objects.py           Knowledge graph object explorer (22 classes)
│   ├── ops.py               5-area ops console (ingest/guardrail/memory/eval/trace)
│   └── auth.py              Cognito callback / logout / whoami
├── schemas/
│   ├── __init__.py         Per-router Pydantic response_model union (v0.5.0)
│   └── sse.py              SSE event Pydantic discriminator — phase/delta/tool_*/guardrail/suggested_followups/stop
└── services/
    ├── agent.py             AgentRunner (Bedrock converse_stream + tool-use loop, trace ring buffer)
    ├── followups.py         Haiku 4.5 follow-up question generator (v0.5.3 — persona KPI tones)
    ├── neptune.py           openCypher client + label-allowlist guard
    ├── search.py            OpenSearch hybrid_search (BM25+KNN+RRF)
    ├── kb.py                Bedrock Knowledge Base retrieve
    ├── eight_d_writer.py    Haiku 4.5 tool-use 8D draft
    ├── compliance_engine.py REACH/RoHS/AEC-Q rule evaluator
    ├── lane_router.py       Reroute simulation
    ├── rfm_scorer.py        Recency × Frequency × Monetary
    ├── carbon_calc.py       Scope sum + CBAM conversion
    ├── reranker.py          Bedrock Cohere reranker (when configured)
    ├── memory.py            DynamoDB-backed AgentCore Memory facts
    ├── guardrails.py        Bedrock Guardrails apply
    └── embedding.py         Titan Embed text v2
```

## Key conventions

- **Synchronous routers** — most are FastAPI `def` (sync). Bedrock-heavy
  ones (chat, eight_d, insights) run via `concurrent.futures.ThreadPoolExecutor`
  with a 25s timeout budget (`_BEDROCK_BUDGET_S`)
- **SSE event vocabulary** — `phase / phase_done / delta / tool_call /
  tool_result / guardrail / log / result / suggested_followups / stop /
  error`. Canonical Pydantic discriminator in `api/schemas/sse.py` (v0.5.0
  contract); the `as_event(...)` helper there is the only place that
  serializes events. Emitter lives in `services/agent.py` (token-level
  streaming via `bedrock_runtime().converse_stream(...)` — ADR-009).
- **Read-only Cypher gateway** — `_tool_neptune` in `routers/chat.py`
  applies a regex deny-list (CREATE / DELETE / DETACH DELETE / SET / REMOVE
  / MERGE / DROP / FOREACH / LOAD CSV / CALL db./dbms./apoc.write) before
  forwarding. ADR-002 has the rationale
- **Label allowlist** — `routers/objects.py` validates Neptune label against
  `_ALLOWED_LABELS` (the 22-class set) before string-interpolating into
  Cypher (Cypher doesn't parameterize labels)
- **Trace ring buffer** — `agent.recent_traces(limit, session_id)` exposes
  the last 200 tool_call events (per-instance, ECS task-local). Powers
  `/api/ops/trace`
- **Bedrock model selection** — chat / insights use `settings.sonnet_model`,
  8D writer + community labeller + **follow-up generator** use
  `settings.haiku_model`. Both are CRIP ids overridable via
  `MFG_SONNET_MODEL_ID` / `MFG_HAIKU_MODEL_ID`. Any new chat-tier model must
  support the Bedrock `converse_stream` API (we no longer use the blocking
  `converse` for chat — see ADR-009).
- **Follow-up questions on /chat** — after `runner.run_stream` finishes,
  `chat.py` calls `api/services/followups.py` with the accumulated assistant
  text + persona, generates 3 short Korean questions tuned to the active
  persona's KPI tone, and emits a `suggested_followups` SSE event right
  before `stop`. Failures degrade to `[]` (never raised mid-stream).

## Gotchas

- **Deterministic fallback first** — every scenario must have a synthetic
  fallback that renders without external services. Don't add a router that
  500s when Neptune is empty
- **AOSS data plane is permission-gated** — the dev EC2 role can list
  collections but not query indices; only the API container's task role
  can. Test ingestion through the API not via opensearchpy locally
- **Cypher edge endpoints** — `~start`/`~end` are Neptune internal IDs,
  not application ids. `objects._build_subgraph_for_id` maintains a
  lookup table; replicate that pattern in any new subgraph builder
- **8D maxTokens** — Haiku 4.5 with `maxTokens=1500` and 8 required string
  fields finishes in 6–10s. Pushing tokens up brings the timeout fallback
  back; reduce only if you change the section count

## Test surface

```bash
pytest tests/api/                                    # full
pytest tests/api/routers/test_eight_d_esg_pdm.py -q  # one router
```
