# CHANGELOG.md

## 0.6.0 — 2026-10-24 (Sonnet 5.5 · real guardrails · PyJWT auth · registry-driven graph)

Hardening and modernisation release. The chat agent moves to Claude Sonnet
5.5, Bedrock Guardrails are actually applied (the old "passed" SSE events
were unconditional), Cognito verification is rebuilt on PyJWT with full
claim checks + OAuth `state`, the knowledge graph is loaded from a single
ontology registry (all 22 labels, 27 relationship types), and the whole
dependency stack is bumped (FastAPI 0.162, Next.js 16 / React 19, CDK 2.274).

### Highlights
- Chat agent on `global.anthropic.claude-sonnet-5-5` with an `effort` knob
  (`MFG_SONNET_EFFORT`, default `low`); Haiku 4.5 tier unchanged
- Guardrails enforced: input pre-check + output check via `ApplyGuardrail`,
  STANDARD tier (Korean-capable), probe-measured 0/43 benign prompts blocked
  (ADR-011)
- ID-token verification checks signature + `exp` + `iss` + `aud` +
  `token_use=id`; login carries an OAuth `state`; Lambda@Edge hands
  unauthenticated viewers to `/api/auth/login`
- API task role can only *read* Neptune (`neptune-db:ReadDataViaQuery` +
  `GetQueryStatus`) — ADR-002 follow-up closed
- `ontology/registry.py` drives loader, TTL, chat schema prompt and a new
  graph contract test: 10,844 nodes / 31,119 edges from the synthetic
  dataset (the old loader wrote 17 labels + BOM edges only)

### LLM / agent (`api/services/agent.py`)
- **Sonnet 5.5** — `MFG_SONNET_MODEL_ID` default is now
  `global.anthropic.claude-sonnet-5-5` (global profile only, no `apac.*`).
  New `MFG_SONNET_EFFORT` (`low|medium|high|xhigh|max`, default `low`) is
  sent as `additionalModelRequestFields.output_config.effort`.
- **No `temperature`** — Sonnet 5.5 rejects sampling parameters; the chat
  request sends only `maxTokens`, raised 2048 → **8192** because thinking
  counts toward the budget.
- **Reasoning blocks** — content blocks (reasoning / text / toolUse) are
  rebuilt in stream order and replayed unchanged (signature / redacted
  content included) in the tool loop.
- **Tool-result backstop** — any tool result over 40 KB is replaced by a
  truncated preview with an explicit marker (`MAX_TOOL_RESULT_BYTES`).
- **botocore `Config` on Bedrock clients** — connect 5s, read 30s, standard
  retry mode × 2 attempts (was botocore defaults: 60s read, legacy retries).
  Client creation in `api/aws_clients.py` is serialised with a lock.
- **Follow-ups bounded to 5s** (`followups._BUDGET_S`); past the budget the
  chips are skipped. Haiku tier (8D writer, follow-ups, community labeller)
  stays on Haiku 4.5.
- **Chat system prompt** embeds `registry.schema_hint()` — the only labels /
  relationship types that exist, with direction — plus the comma-joined
  list-property convention.

### Guardrails (`api/services/guardrails.py`, `infra-cdk/lib/ai-stack.ts`)
- **Real checks** — `check()` returns a `GuardrailVerdict`
  (`blocked / hits / message / detected`). Input check runs `ApplyGuardrail`
  on the user question only (not on tool results — a Neptune row listing
  SVHC substances must not trip HazardousChemical); a blocked question never
  reaches the model and the stream stops with `guardrail_intervened`. Output
  check runs on the full answer after streaming, so token-level deltas stay
  live. Detect-mode hits surface as "탐지(모니터링)" plus a log line that
  `/ops/guardrail` picks up. An ApplyGuardrail failure fails open with a
  `log` event — it never claims a pass.
- **STANDARD tier** via the `apac.guardrail.v1:0` cross-Region guardrail
  profile. CLASSIC supports English / French / Spanish only and misjudged
  Korean (blocked 5/31 demo samples).
- **Topic modes** — IPConfidential + CompetitorDisparagement **BLOCK**;
  RegulationViolation + HazardousChemical **detect-only** (in BLOCK mode they
  stopped 7/12 ordinary compliance questions). Topic definitions rewritten
  around prohibited *intent* rather than regulation / chemical names.
  Content filter MISCONDUCT: input LOW / output HIGH.
- **`BEDROCK_GUARDRAIL_VERSION`** setting (default `DRAFT`).
- **`scripts/guardrail_probe.py`** — runs the demo samples + 12 ordinary
  compliance questions (must not block) and 10 held-out violations through
  the deployed guardrail; exits 1 on any benign block.

### Auth / security
- **python-jose → PyJWT** — `CognitoJwtVerifier` (`api/middleware_auth.py`),
  shared by the middleware and `/api/auth/whoami` (one JWKS cache, 1h TTL).
  Verifies RS256 signature + `exp` + `iss` + `aud` (= `settings.cognito_client_id`,
  env `COGNITO_CLIENT_ID`) + `token_use=id`, 30s leeway. Invalid tokens get a
  generic `401 {"error": "invalid token"}`.
- **OAuth `state` (login CSRF)** — `/api/auth/login` sets an HttpOnly
  `mfg_oauth_state` cookie (10 min, `path=/api/auth`); `/api/auth/callback`
  returns `400 invalid_oauth_state` on mismatch.
- **Lambda@Edge** — redirects unauthenticated viewers to `/api/auth/login`
  (no more Cognito URL baked in at synth time), bypasses all `/api/auth/*`,
  runtime `nodejs20.x` → `nodejs22.x`.
- **Demo password custom resources removed** from EdgeStack — the repo copy
  of the password is a placeholder, so every redeploy would have reset both
  demo logins. Passwords are managed out-of-band (1Password).
- **Neptune IAM read-only** — API task role `neptune-db:*` →
  `neptune-db:ReadDataViaQuery` + `neptune-db:GetQueryStatus`.
- **Cypher gateway hardening** (`api/routers/chat.py`) — deny-list also runs
  on a comment- and backtick-normalised copy (`LOAD/**/CSV`,
  `` CALL `db`.x() ``); trailing `LIMIT` appended / clamped to 100; results
  truncated at 100 rows / 32 KB with an explicit `truncated` marker.
- **`memory_save` session binding** — `session_id` is injected server-side
  per request; the model can no longer choose (or collide) the partition.

### Infra (CDK)
- **Neptune engine 1.4.7.0 → 1.4.8.1** (in-place minor upgrade, deployed
  2026-10-24; pre-upgrade snapshot `ontology-mfg-dev-neptune-pre-1-4-8-1-20261024`).
  Cluster now has `DeletionPolicy` / `UpdateReplacePolicy: Snapshot`.
- **AOSS data access policy** principals (KB role, loader task role, API task
  role) declared in IaC — the loader and API roles had been hand-added and
  would have been dropped by any CloudFormation update of the policy.
- `aws-cdk-lib` 2.274 · `aws-cdk` CLI 2.1146 · `constructs` 10.8.1.
- Fixed the AIStack Jest test that had failed since `878bbe0` (it still
  expected a `CfnKnowledgeBase`; the KB is intentionally created post-deploy).
- **Loader task role** (hand-made, imported by name) gets a CDK-managed
  `LoaderEmbeddingPolicy`: `bedrock:InvokeModel` on Titan Embed v2 only, so
  `data/load_search.py` can write KNN embeddings.
- **Images** — API image drops `gcc`; web runtime stage removes the base
  image's bundled npm/npx (they carried its fixable HIGH findings). ECR
  enhanced scan: api Critical 17 / High 93 → 0 / 4, web Critical 14 / High 91
  → 0 / 7 — the rest are Debian packages with no fixed version yet.

### Graph / data
- **Chat schema hint carries edge properties** — `registry.schema_hint()`
  renders `(Component)-[:SUPPLIED_BY {leadtime, moq, otd, unit_price_usd}]->(Supplier)`
  (`EdgeSpec.data_props`, contract-tested against loader output). Before, the
  agent read price from the nodes and concluded it didn't exist; verified in-VPC
  that it now binds `r` and answers from the edge.
- **Demo hero part now exists** — every sample (/chat, /compliance, /substitute,
  /price, Manny) starts from `AMZN-CMP-IC-00001`, but the global component
  counter numbered the first IC `00012`, so those demos always fell back to
  synthetic. `boms.py` now assigns the id to the first IC (3 SUPPLIED_BY offers,
  AEC-Q100 + JESD22, benign substances).
- **`ontology/registry.py`** — single source of truth: 22 `NodeSpec`s and the
  edge derivation rules (27 relationship types), Cypher UPPER_SNAKE ↔ TTL
  camelCase. `ontology/schema.ttl` is now generated
  (`python -m ontology.build_ttl`, `--check` for staleness);
  `ontology/upload.py` replaces the schema in its own named graph.
- **`data/load_graph.py`** rewritten — loads all 22 labels (incl. reference
  Region / Standard / Regulation / Substance nodes from `data/reference.py`)
  plus FK-derived edges via batched `UNWIND … MERGE`. Flags: `--reset`
  (DETACH DELETE registry labels first), `--dry-run` (offline counts),
  `--nodes-only`, `--allow-dangling`, `--batch-size`; `--bom-edges` is a
  deprecated no-op. List properties the API reads (standards, substances,
  regulations) are stored comma-joined; read them with
  `api.services.neptune.list_prop()`.
- **`data/load_search.py`** — generates document embeddings (Titan Text
  Embeddings v2, 1024-d, `data/embedding.py`) and recreates the index on
  every full load (AOSS VECTORSEARCH auto-assigns `_id`, so re-runs no longer
  duplicate documents). `--no-embed`, `--keep-index` flags.
- **Synthetic data** — `data/synthetic/sourcing.py` adds SUPPLIED_BY offers
  (lead time / OTD / unit price / MOQ) and MADE_OF sources;
  `data/public/materials.py` adds benign constituent substances;
  `data/synthetic/pipeline.py` generates the full dataset in memory for tests.
- Object-explorer synthetic subgraphs derive from the registry (only real
  relationship types, in their real direction).

### Backend fixes
- **8D model chip** — `_short_model_label` reads family + version from the
  model id (it still said "Sonnet 4.6" while Haiku ran).
- AOSS SigV4 uses `opensearch-py`'s `AWSV4SignerAuth` with refreshable
  credentials (hourly ECS task-role key rotation no longer 403s search
  until the task restarts).
- Synthetic fallbacks no longer 500 when `NEPTUNE_ENDPOINT` is unset.
- `/api/compliance` returns `status: compliant | non_compliant |
  insufficient_data | invalid_input`; no substance declaration ≠ compliant.
  The chat `compliance_check` tool uses the same lookup.
- `/api/eight-d` stream always ends with exactly one `stop`.
- `/api/price` robust to missing offer fields (`price_available` /
  `leadtime_available` flags).
- Pooled Neptune `requests.Session` with one refreshable credential provider.
- `search_semantic` tool returns the application id (`_source.id`), not the
  AOSS `_id`.

### Web
- **Next.js 14 → 16.4.3**, React 19.3.1 (async route `params` unwrapped with
  `use()`), Turbopack builds, jspdf 4.2.1, ESLint 9 flat config, vitest
  4.1.12. Plain `npm ci` works (no `--legacy-peer-deps`); image base
  `node:24-slim`.
- SSE stop contract (`error:<status>`, `fetch_error:…`, `aborted`), stream
  tokens drop late events, unmount cancels, `error` events render.
- `apiUrl()` (`lib/api-base.ts`) builds every API URL; Cytoscape stable
  deps; objects page aborts stale fetches; PDF export rasterizes block-wise
  (no more blank pages on long chats); Manny ESC via a same-origin
  `postMessage` bridge (`lib/manny-bridge.ts`).
- Compliance `insufficient_data` renders as "판정 불가"; price page
  null-guards.

### Dependencies
- Single source of truth: `api/requirements.txt` + new
  `loader/requirements.txt` are the exact pins the images install; root
  `requirements.txt` includes both, so CI tests and `pip-audit`s what ships.
- FastAPI 0.162 · Starlette 1.9 · sse-starlette 3.5 · uvicorn 0.54 ·
  pydantic 2.14 · boto3 1.43 · PyJWT 2.15. Removed unused `gremlinpython`,
  `psycopg` and `requests-aws4auth` from the API (`requests-aws4auth` stays
  in the loader).
- Dev tools: pytest 9.1 · pytest-asyncio 1.4 · ruff 0.17 · black 26 ·
  mypy 2.4 · pip-audit 2.10.
- `api/Dockerfile` no longer installs `gcc`.

### CI / tooling
- `ruff check` and `black --check` are now **blocking**; `pip-audit` on the
  shipped pins; `npm audit --audit-level=high` for web (`--omit=dev`) and
  cdk; web job runs vitest; Node 24.
- Makefile: `PYTHON` defaults to `.venv/bin/python` (falls back to
  `python3`); `make load-graph` runs `--reset`.

### Tests
- pytest 175 → **372**; web vitest **63**; cdk Jest **38**. New:
  `tests/integration/test_graph_contract.py` (every label / relationship /
  property the API's Cypher reads ⊆ loader output), `test_chat_tools.py`,
  `test_registry.py`, `test_list_props.py`, `test_aws_clients.py`, ops tests.

### Deploy notes
- **Deploy EdgeStack before the new API image** — the new `/callback`
  rejects a login without `state`, and the old Lambda@Edge sends viewers
  straight to Cognito without one. See `docs/runbooks/deploy-production.md`.
- Never cross a Neptune *major* version through CloudFormation — snapshot
  and upgrade with the CLI first, then align `engineVersion`.
- `make load-graph` (`--reset`) must run at least once so edges from the old
  loader don't linger.

## 0.5.6 — 2026-05-15 (token-level streaming)

Chat responses now paint incrementally token-by-token instead of arriving
as one block when the model finishes. The previous implementation buffered
the full Bedrock response and emitted a single delta — even short answers
felt slow. gcc has always done this right; we now match.

### Performance / UX
- **`api/services/agent.py` switched from `converse(...)` to
  `converse_stream(...)`** — every `contentBlockDelta` event is forwarded
  to the SSE client as its own `delta` event the moment it arrives.
  Time-to-first-byte goes from ~2-5s (whole-answer wait) to ~300-600ms
  (first token).
- **Tool input streaming** — `toolUse.input` arrives as partial JSON
  chunks across multiple `contentBlockDelta` events; accumulated and
  parsed at `messageStop`. Malformed streams fall back to `{}` with a
  warning instead of crashing the agent loop.

### Tests
- 172 → **175** passing. Updated `test_agent_service.py` to mock the
  streaming event shape (`{"stream": [...]}`); added explicit tests for
  per-chunk delta emission and malformed-JSON tool-input fallback.

### Notes
- The mfg edge stack already excludes `ORIGIN_RESPONSE` Lambda@Edge from
  `/api/*` paths, so CloudFront does NOT buffer the chunked SSE body. No
  edge changes required for this to work end-to-end.

## 0.5.5 — 2026-05-15 (Manny popup + SSE stream hardening)

Manny launcher now opens a dedicated chat surface (popup window or
in-page modal) and the chat SSE generator guarantees a terminal event
even on mid-stream failure.

### Features
- **`/manny` route** — chat-only popup page (no sidebar / top bar /
  floating button). LayoutShell branches on pathname to suppress chrome.
  Full chat surface with persona switcher, sample queries, follow-up
  chips, and same `/api/chat` backend.
- **UA-branching launcher** — `FloatingChat.tsx` rewritten:
  - Chromium (Chrome / Edge / Brave / Opera) → in-page iframe modal
    targeting `/manny`. Same-origin → Cognito + SSE both work.
  - Firefox / Safari → `window.open` with popup features (480×760).
  - Popup blocked or downgraded to tab → in-page modal fallback.
  - ESC closes modal.
- **`LayoutShell.tsx`** — client-side chrome dispatcher. New file; moves
  the sidebar/top-bar/FloatingChat rendering out of `app/layout.tsx`
  (which is a server component) so we can `usePathname()` to skip
  chrome on `/manny`.

### Reliability
- **`/api/chat` mid-stream exception hardening** — `chat.py`'s SSE
  generator now wraps the `runner.run_stream()` loop in
  `try/except/finally`. Any unexpected exception (e.g. `as_event`
  serializer failure, follow-up call corner case) emits a synthetic
  `error` + `stop` event so the client never sees a silent connection
  drop. Stack trace logged to CloudWatch via `log.exception(...)`.
- **`stop` event always reaches the client** — even if the inner loop
  exits without emitting one (`stream_end` reason), the `finally` block
  guarantees it. Mirrors the `final` event pattern from gcc.

### Notes
- **CloudFront SSE invariants already in place** — mfg's edge stack
  attaches Lambda@Edge only at `VIEWER_REQUEST` (auth), never at
  `ORIGIN_RESPONSE`, so CloudFront does not buffer the chunked SSE
  body. SSE compression disabled on `/api/*` paths (commit `d480108`).
- **maxTokens per scenario** — chat uses `2048` (`agent.py:92`);
  separate from 8D writer (`1500`) and insights. Stop-reason
  `max_tokens` is therefore a real truncation signal, not a default.

## 0.5.4 — 2026-05-15 (Manny floating chatbot + top bar fix)

Port of the global floating chatbot pattern from `ontology-for-gcc` and
fix for the layout top bar overlap.

### Features
- **`web/components/FloatingChat.tsx`** — Manny (매니), the manufacturing
  mascot chatbot. Bottom-right fixed button on every page → slide-in
  right drawer with persona-aware welcome prompts (5 sample queries per
  buyer/engineer/quality/scm/plant), multi-turn chat against `/api/chat`,
  tool-call footer, and v0.5.3 follow-up chips. ESC closes; persona
  switch resets the session.
- Naming: "Manny" mirrors the gcc/mfg sister-project mascot pattern
  (Cally ↔ Manny). Branded with the existing mfg accent-blue gradient +
  wow-orange AI badge.

### Fixes
- **Top bar no longer overlaps content** — `web/app/layout.tsx` was using
  `absolute top-3 right-6` for the GuidedTour + PersonaSwitch chip row,
  which overlapped every page's ScenarioHeader. Switched to gcc's flex
  pattern: a fixed-height (`h-12`) sibling above `{children}` inside a
  `flex h-screen overflow-hidden` shell.

### Not ported (from gcc)
- Popup-window / Chrome iframe-modal fallback for `/cally` — gcc needs
  this because the chat surface IS a separate popup; mfg's primary chat
  surface is the full `/chat` page, so the drawer alone is enough.
- `StationChatPanel` — gas-station-domain specific, no mfg analogue.

## 0.5.3 — 2026-05-15 (follow-up chips on /chat)

Port of the headline UX feature from `ontology-for-gcc`: after every chat
turn, the agent suggests 3 short Korean follow-up questions tuned to the
active persona's domain KPIs. Click → sent as the next user turn.

### Features
- **`api/services/followups.py`** — Bedrock Haiku 4.5 generator (300
  tokens, temperature 0.7, ~600ms p50). Persona tone table maps each of
  the 5 mfg personas (buyer / engineer / quality / scm / plant) to its
  domain KPIs from the 22-class ontology. Empty / failed calls degrade to
  `[]` — never propagated into the SSE stream.
- **`suggested_followups` SSE event** — emitted by `/api/chat` immediately
  before `stop`, with `items: string[]`. Added to the Pydantic
  discriminator union in `api/schemas/sse.py` so the wire contract stays
  typed.
- **Chat UI chips** (`web/app/chat/page.tsx`) — clickable rounded buttons
  below the last assistant response, only visible when not streaming and
  the model returned 1–3 items. Click → `sendMessage(q)`. Cleared on
  persona switch, new turn, and empty results.

### Tests
- 163 → **172** passing. New: `tests/api/services/test_followups.py` (7
  cases — persona coverage, parser bullet/length filters, empty-input
  short-circuit, Bedrock failure isolation, unknown-persona fallback) +
  2 new SSE integration tests in `tests/api/routers/test_chat.py`.

### Not ported (from gcc)
- `ChatThread` / `ToolCallPanel` component extraction — current chat
  inlines these and the existing layout works.
- `AgentCore Memory write_event` — mfg's `services/memory.py` already
  covers session-scoped facts; full short/long namespace split deferred.
- `services/persona.py` KPI registry — followup tones serve as the SSOT
  for now; if a second router needs them, promote to a registry then.

## 0.5.2 — 2026-05-15 (cleanup + env alignment)

Project-analysis pass: removed dead routes, aligned Python toolchain to the
declared 3.12, added cross-cutting integration coverage, and wired CI.

### Removed
- **5 legacy persona route groups** — `web/app/(buyer|engineer|quality|scm|plant)/`
  were dead and unlinked (sidebar drives to canonical `/search`, `/insights`,
  etc.); `tsc --noEmit` confirms zero external references. Cuts ~30 stale
  `page.tsx` files. CLAUDE.md previously flagged these as "dead and unlinked".

### Environment
- **`pyproject.toml`** — declares `requires-python = ">=3.12"` and centralizes
  ruff/black/mypy/pytest config (was scattered or missing). Locks the
  toolchain that CLAUDE.md mandates.
- **`requirements.txt`** — adds `python-jose[cryptography]`, `sse-starlette`,
  pins `starlette<0.42`. These were de-facto dependencies of `api/main.py`
  but missing from the manifest; fresh 3.12 envs broke without them.
- **`make venv`** target — one-shot Python 3.12 venv bootstrap.

### Tests
- **`tests/integration/test_scenario_contracts_e2e.py`** — locks v0.5.0
  contract work: every sync scenario endpoint must declare a Pydantic
  `response_model`, all 12 routes must be wired, OpenAPI metadata must be
  non-empty. Fails fast on contract regressions.
- 159 → **163** passing under Python 3.12.

### CI
- **`.github/workflows/ci.yml`** — three parallel jobs on push/PR to main:
  api (pytest 3.12 + ruff + black), web (tsc + Next build), cdk (Jest
  invariants). Closes the gap CLAUDE.md never had to fill while the demo
  was hand-deployed.

### Harness-eval
- Re-scored against the standard checklist: 5/16 → 7/16 PASS. The unchanged
  overall (1.6/F) is expected — the standard rubric measures Claude Code
  plugin adoption (hooks/skills/agents/deny-list), which is orthogonal to
  the manufacturing PoC scope. Full multi-agent eval (the rubric that
  produced the v0.4.0 7.8/B) needs separate re-run.

## 0.5.1 — 2026-05-09 (patch)

`/simplify` review pass on 0.5.0 — three review agents (reuse / quality
/ efficiency) found 11 actionable items, 9 are fixed here. Test suite
stays at 159/159 green; pure runtime improvements + tightening.

### Performance
- **`/api/ops/eval` parallelization** — 30 wow queries now run via
  `ThreadPoolExecutor(max_workers=8)` instead of serial. Wall time drops
  from ~6–15s to ~1.5–3s. The "라이브 실행 (30 쿼리)" button on the
  ops console feels comparable to the SSE flows now.
- **`/api/ops/eval` history cache (30s)** — separate cache for the
  durable history trend. Previously the 10-min cached fast path was
  burning a DynamoDB query on every poll; now both paths consult an
  in-memory cache that busts when a fresh run lands.
- **Cached AWS client factories** — `api/aws_clients.py` gains
  `dynamodb()` and `cloudwatch_logs()` (existing factories: bedrock-
  runtime, bedrock-agent-runtime, secretsmanager, s3). `ops.py` now
  uses these instead of constructing fresh `boto3.client(...)` per
  call.

### Correctness
- **`/api/ops/eval` concurrency lock** — `threading.Lock` around the
  fresh-run branch prevents two concurrent `run=true` requests from
  both executing the 30 queries and double-writing the same run id to
  DynamoDB.
- **DynamoDB TTL attribute** — eval-history items now carry a `ttl`
  numeric attribute (90 days) so the table self-prunes when DynamoDB
  TTL is enabled on it. Prevents unbounded growth.

### Quality
- **`GuardrailEvent.result`** — `Literal["passed", "blocked"]` (was
  raw `str`). Matches the rest of `api/schemas/sse.py` discriminator
  pattern.
- **`_MODEL_LABELS` constants** — Haiku/Sonnet/Opus chip labels pulled
  out of `_short_model_label`'s function body into a single table at
  module top. Future model renames touch one line.
- **Single SSE serializer** — both `chat.py` and `eight_d.py` now
  call `api.schemas.sse.as_event()` instead of inline `{event:..., data:
  json.dumps(...)}` (chat) or a 7-line shim (eight_d). The shim is
  deleted.
- **`Candidate` shared type** — `SubstituteCandidate` and `SpecCandidate`
  unified into one model in `api/schemas/__init__.py` with both names
  preserved as aliases for call-site clarity.

### Skipped (review notes)
- `_LooseModel` (response shapes) vs `_LooseEvent` (SSE discriminators)
  — different conceptual roles, kept separate.
- `_InlineExecutor` test helper — single use, will promote to conftest
  when a second SSE test needs it.
- DynamoDB helper extraction across `memory.py` + `ops.py` — valid but
  out of scope; deferred to ADR-009 + `api/services/ddb.py`.

## 0.5.0 — 2026-05-09

Closes the four broader recommendations from the harness-eval Full
report (0.4.0 / 7.8 → expected ~9.0+). Coverage strengthening across
contracts (Pydantic), CDK invariants (IAM + SSE compression), SSE
event vocabulary unification, and durable eval history.

### Highlights
- Typed `response_model` on all 7 sync scenario routers — OpenAPI
  spec is now machine-usable, not `{}` blobs
- CDK Jest tests now lock the IAM-scope and CloudFront-SSE-compression
  invariants — regressions fail-fast in CI
- SSE event vocabulary centralized — single Pydantic source of truth
  + matching TypeScript discriminated union
- `/api/ops/eval` runs persisted to DynamoDB → cross-deploy trend
  visibility

### Features
- **feat(api/schemas)** — New `api/schemas/__init__.py` with Pydantic
  response models for `SearchResponse`, `SubstituteResponse`,
  `ComplianceResponse`, `PriceResponse`, `SpecMatchResponse`,
  `SupplierRfmResponse`, `PdmResponse`. All routers now declare
  `response_model=` so FastAPI auto-validates outbound shape and the
  OpenAPI spec carries field descriptions.
- **feat(api/schemas/sse)** — Single source of truth for the 9-event
  SSE vocabulary (`PhaseEvent`, `PhaseDoneEvent`, `DeltaEvent`,
  `ToolCallEvent`, `ToolResultEvent`, `GuardrailEvent`, `LogEvent`,
  `ErrorEvent`, `ResultEvent`, `StopEvent`). `as_event()` helper
  formats any model into sse-starlette's `{event, data}` shape.
- **feat(web/lib/sse-events.ts)** — Mirroring TypeScript discriminated
  union with `isEvent<T>()` type-narrowing helper. Producer and
  consumer now reference the same contract.
- **feat(infra-cdk)** — Two new CDK Jest assertions:
  - `compute-stack.test.ts` rejects any IAM policy granting
    `Action: "*"` on `Resource: "*"` (allow effect) on task roles.
  - `edge-stack.test.ts` requires at least one CloudFront cache
    behavior with `Compress: false` (locks ADR-007 invariant).
- **feat(api/ops/eval)** — Each eval run is now persisted to
  DynamoDB table `ontology-mfg-dev-eval-history` (PK `partition`,
  SK `run_id` ISO timestamp). Endpoint response now carries
  `history: List[...]` with the most recent 30 runs so the UI can
  plot trends without a second call. Best-effort write — DynamoDB
  failures fall back silently to in-memory.

### Internal
- Same `_LooseModel` base (`extra="allow"`) used across both schema
  modules so router-side enrichment fields (`_synthetic`,
  `model_label`, `total_s`, etc.) survive validation.
- `eight_d.py` `_sse_event` now thin-shims over `api.schemas.sse.as_event`
  so future emit sites can use typed Pydantic models without
  rewriting all 9 yield points at once.

## 0.4.1 — 2026-05-09 (patch)

Top-3 fixes from the harness-eval Full report (7.8/B → expected ~8.5+
on next run). Pure config + test changes; no application surface modified.

- **fix(safety)** — Add `permissions.deny` block to `.claude/settings.local.json`
  with 53 entries covering destructive `git`/`aws`/`docker`/`curl|sh`/`npm`
  patterns (rm -rf, push --force, iam delete-*, kms schedule-key-deletion,
  pipe-to-shell egress, system prune, npm publish, eval/exec). Closes the
  single highest-leverage harness-safety gap surfaced by the safety
  evaluator.
- **fix(test)** — Add `tests/api/routers/test_objects.py` (45 tests)
  covering `_validate_label` allowlist (incl. Cypher-injection rejection),
  `_flatten_node` for all 3 Neptune wire formats, `_to_list_item` rank
  scoring per label, the 3 `/api/objects/*` endpoints, and the ADR-006
  no-dangling-edge invariant on synthesized subgraphs.
- **fix(test)** — `test_insights::test_insights` previously failed with
  `KeyError: 'region'`; mock now includes the `region` field. `make test`
  exits 0 cleanly for the first time. Removed the "ignore this failure"
  notes from root and `api/CLAUDE.md`.
- **fix(test)** — `test_price` mock was missing `unit_price_usd`; added.
- **fix(test)** — `test_eight_d` rewritten for the SSE pipeline (v0.3.0
  introduced SSE; the test was still asserting against pre-SSE JSON
  shape). Now drains the async body_iterator via `asyncio.run()` and
  asserts `phase`/`result`/`stop` events arrive with the markdown +
  8 sections in the result event. Module-level `_BEDROCK_POOL` is
  swapped for an inline executor in the test to avoid event-loop
  cross-pollution between tests.
- **fix(test)** — `test_draft_returns_8_sections` (eight_d_writer)
  switched from `invoke_model` mock to `converse` mock matching the
  actual writer pathway (introduced in v0.3.0).

Test suite: **159 / 159 passing** (was 156 / 158 with 2 pre-existing
mocked-API failures + 1 pollution failure).

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
