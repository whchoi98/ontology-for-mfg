# api/CLAUDE.md

FastAPI backend for the 12 manufacturing scenarios + ops console + auth.

## Role

- One router per scenario (A–L), each backed by Neptune (openCypher) and/or
  OpenSearch (BM25 + KNN), with Bedrock Converse for the agentic flows
- SSE streaming for long-running flows (chat, 8D) so the UI can render live
  phase chips
- Synthetic-fallback pattern everywhere: when Neptune / OpenSearch / Bedrock
  is unreachable, deterministic templates keep the demo from blanking

## Layout

```
api/
├── main.py                  FastAPI app + middleware wiring
├── config.py                Settings (env-driven, validated at import)
├── aws_clients.py           Cached boto3 client factories (locked creation, Bedrock botocore Config)
├── middleware_auth.py       CognitoJwtVerifier (PyJWT) + CognitoBearerAuth middleware
├── requirements.txt         Exact pins the image installs (root requirements.txt includes it)
├── Dockerfile               linux/arm64 python:3.12-slim (no gcc)
├── routers/
│   ├── chat.py              B — AgentRunner SSE + 5 tools + read-only Cypher gateway + suggested_followups
│   ├── search.py            A — hybrid BM25+KNN with Cohere reranker
│   ├── insights.py          C — Neptune aggregates + templated summary (JSON, no LLM)
│   ├── spec_match.py        D — req → candidates + standards subgraph
│   ├── compliance.py        E — REACH-SVHC / RoHS substance check (compliant | non_compliant | insufficient_data)
│   ├── substitute.py        F — same-fn + shared-standard alternatives
│   ├── price.py             G — multi-supplier price/lead-time matrix (SUPPLIED_BY edge props)
│   ├── scm_lane.py          H — TradeLane + IRA/USMCA/CBAM reroute
│   ├── supplier_rfm.py      I — RFM scoring with tier weighting
│   ├── eight_d.py           J — SSE: Neptune→KB→Bedrock 8D writer (Haiku)
│   ├── esg_cbam.py          K — Scope 1/2/3 + CBAM 환산
│   ├── pdm.py               L — Telemetry threshold alarms + recos
│   ├── objects.py           Knowledge graph object explorer (22 classes, registry-derived synthetic subgraphs)
│   ├── ops.py               5-area ops console (ingest/guardrail/memory/eval/trace)
│   └── auth.py              Cognito login (OAuth state) / callback / logout / whoami
├── schemas/
│   ├── __init__.py         Per-router Pydantic response_model union (v0.5.0)
│   └── sse.py              SSE event Pydantic discriminator — phase/delta/tool_*/guardrail/suggested_followups/stop
└── services/
    ├── agent.py             AgentRunner (Sonnet 5.5 converse_stream + tool loop + guardrail checks, trace ring buffer)
    ├── guardrails.py        ApplyGuardrail wrapper — check() → GuardrailVerdict
    ├── followups.py         Haiku 4.5 follow-up question generator (persona KPI tones, 5s budget)
    ├── neptune.py           openCypher client (SigV4, pooled session) + list_prop() / flatten helpers
    ├── search.py            OpenSearch hybrid_search (BM25+KNN+RRF, AWSV4SignerAuth)
    ├── kb.py                Bedrock Knowledge Base retrieve
    ├── eight_d_writer.py    Haiku 4.5 tool-use 8D draft
    ├── compliance_engine.py REACH-SVHC / RoHS rule evaluator (AEC-Q / JEDEC only echoed, not verified)
    ├── lane_router.py       Reroute simulation
    ├── rfm_scorer.py        Recency × Frequency × Monetary
    ├── carbon_calc.py       Scope sum + CBAM conversion
    ├── reranker.py          Bedrock Cohere reranker (when configured)
    ├── memory.py            DynamoDB-backed AgentCore Memory facts
    └── embedding.py         Titan Embed text v2 (query side)
```

## Key conventions

- **Synchronous routers** — most are FastAPI `def` (sync). Bedrock-heavy
  ones (chat, eight_d) run via `concurrent.futures.ThreadPoolExecutor`
  with a 25s timeout budget (`_BEDROCK_BUDGET_S`). Bedrock clients carry a
  botocore `Config` (connect 5s / read 30s / standard retries ×2) — always
  get clients from `aws_clients.py`, never `boto3.client(...)` inline
- **SSE event vocabulary** — `phase / phase_done / delta / tool_call /
  tool_result / guardrail / log / result / suggested_followups / stop /
  error`. Canonical Pydantic discriminator in `api/schemas/sse.py` (v0.5.0
  contract); the `as_event(...)` helper there is the only place that
  serializes events. Emitter lives in `services/agent.py` (token-level
  streaming via `bedrock_runtime().converse_stream(...)` — ADR-009). Every
  stream ends with exactly one `stop` (`guardrail_intervened`,
  `bedrock_error`, `stream_error`, … on failure)
- **Chat model (Sonnet 5.5)** — `settings.sonnet_model`
  (`MFG_SONNET_MODEL_ID`, default `global.anthropic.claude-sonnet-5-5`) +
  `settings.sonnet_effort` (`MFG_SONNET_EFFORT`, default `low`, sent as
  `additionalModelRequestFields.output_config.effort`). No `temperature`
  (rejected); `maxTokens=8192` because thinking counts. Reasoning blocks are
  replayed unchanged in the tool loop. 8D writer, community labeller and
  follow-up generator use `settings.haiku_model` (`MFG_HAIKU_MODEL_ID`,
  Haiku 4.5). Any new chat-tier model must support `converse_stream`
- **Guardrails** — `agent._run_guardrail` (used by `AgentRunner`) calls
  `guardrails.check(text, "INPUT"|"OUTPUT")` directly (not Converse
  `guardrailConfig`, which would also screen tool results). Input: user
  question only; blocked → model never called. Output: full answer after
  streaming; blocked → warning delta + `stop(guardrail_intervened)`.
  `detected` (detect-mode topics) → "탐지(모니터링)" + `guardrail detected`
  log line for `/ops/guardrail`. Exceptions fail open with a `log` event —
  never emit "passed" without a real check. ADR-011
- **Read-only Cypher gateway** — `_tool_neptune` in `routers/chat.py`
  applies a regex deny-list (CREATE / DELETE / DETACH DELETE / SET / REMOVE
  / MERGE / DROP / FOREACH / LOAD CSV / CALL db./dbms./apoc.write) to the raw
  text **and** a comment-/backtick-stripped copy, appends or clamps
  `LIMIT 100`, and truncates results to 100 rows / 32 KB with a
  `truncated` marker. `agent._bound_tool_result` backstops every tool at
  40 KB. IAM is the second wall: the task role has only
  `neptune-db:ReadDataViaQuery` + `GetQueryStatus`. ADR-002
- **Graph schema comes from `ontology/registry.py`** — the chat system
  prompt embeds `registry.schema_hint()` (labels, rel types and edge
  properties such as `SUPPLIED_BY {unit_price_usd, leadtime, …}`); new Cypher must only use labels /
  rels / properties the loader writes (`tests/integration/test_graph_contract.py`
  enforces this statically). List props are comma-joined strings — use
  `neptune.list_prop()` (or `split(x, ',')` in Cypher)
- **Label allowlist** — `routers/objects.py` validates Neptune label against
  `_ALLOWED_LABELS` (the 22-class set) before string-interpolating into
  Cypher (Cypher doesn't parameterize labels)
- **Auth** — `middleware_auth.verifier` (one instance, JWKS cached 1h) is
  shared by the middleware and `/api/auth/whoami`. It checks RS256
  signature + `exp` + `iss` + `aud` (= `settings.cognito_client_id`, env
  `COGNITO_CLIENT_ID`) + `token_use == "id"`; failures return a generic
  `401 {"error": "invalid token"}`. `/api/auth/login` issues the OAuth
  `state` cookie (`mfg_oauth_state`); `/callback` 400s on mismatch.
  `/api/auth/*` is exempt from the middleware
- **Session-scoped tools** — `chat._build_tools(session_id)` builds the tool
  list per request; `memory_save` is bound to the request's session (the
  model never supplies `session_id`)
- **Trace ring buffer** — `agent.recent_traces(limit, session_id)` exposes
  the last 200 tool_call events (per-instance, ECS task-local). Powers
  `/api/ops/trace`
- **Follow-up questions on /chat** — after `runner.run_stream` finishes,
  `chat.py` calls `api/services/followups.py` with the accumulated assistant
  text + persona, generates 3 short Korean questions tuned to the active
  persona's KPI tone, and emits a `suggested_followups` SSE event right
  before `stop`. Failures / the 5s budget degrade to `[]` (never raised
  mid-stream)

## Gotchas

- **Deterministic fallback first** — every scenario must have a synthetic
  fallback that renders without external services (including when
  `NEPTUNE_ENDPOINT` is unset — `NeptuneClient()` raises). Don't add a
  router that 500s when Neptune is empty
- **Compliance "no data" ≠ compliant** — `status: insufficient_data`
  (`compliant: null`) when a component declares no substances; the chat
  `compliance_check` tool goes through the same `evaluate_component` lookup
- **AOSS data plane is permission-gated** — the dev EC2 role can list
  collections but not query indices; only the API / loader task roles can
  (principals declared in `infra-cdk/lib/ai-stack.ts`). Test ingestion
  through the API, not via opensearchpy locally. Sign with
  `AWSV4SignerAuth(refreshable creds)` — frozen keys 403 after rotation
- **Cypher edge endpoints** — `~start`/`~end` are Neptune internal IDs,
  not application ids. `objects._build_subgraph_for_id` maintains a
  lookup table; replicate that pattern in any new subgraph builder
- **AOSS `_id` ≠ application id** — the application id is `_source.id`
  (VECTORSEARCH auto-assigns `_id`)
- **8D maxTokens** — Haiku 4.5 with `maxTokens=1500` and 8 required string
  fields finishes in 6–10s. Pushing tokens up brings the timeout fallback
  back; reduce only if you change the section count

## Test surface

```bash
pytest tests/api/                                    # full
pytest tests/api/routers/test_eight_d_esg_pdm.py -q  # one router
pytest tests/integration/test_graph_contract.py -q   # API Cypher ⊆ loader output
```
