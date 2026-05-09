# ADR-003 — SSE for long-running Bedrock + 25s in-process timeout + deterministic fallback

- **Status**: Accepted
- **Date**: 2026-05-09
- **Related commits**: `7b5197e`, `262a61a`

## Context

The 8D pipeline (`/api/eight-d`) was a sync POST returning JSON. Bedrock
Sonnet 4.6 with 8 required string fields took 30–40s in p95, so the
pipeline always exceeded CloudFront's 30s origin response timeout — users
saw 504. The deterministic fallback in `eight_d.py` was never reached.

Beyond the timeout, sync POSTs offered no progress feedback during a
long Bedrock call; users saw a spinner with no signal whether anything
was happening.

## Decision

Three coordinated changes:

1. **Convert `/api/eight-d` to SSE** (`EventSourceResponse`) emitting
   `phase / phase_done / result / stop` events — same vocabulary as
   `/api/chat`. Web renders chat-style phase chips during the run.

2. **Bound the Bedrock call with a 25s timeout** using a module-level
   `concurrent.futures.ThreadPoolExecutor` and `future.result(timeout=25)`.
   On `TimeoutError`, route to the deterministic `_fallback_draft()`.

3. **Deterministic fallback template** for every D-section so the UI
   never blanks. Banner explicitly says "결정론적 폴백 템플릿" so users
   know it's not LLM output.

The 25s budget leaves 5s headroom under CloudFront's 30s origin response
timeout for response serialization + network.

## Alternatives Considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Increase CloudFront origin timeout 30s→60s | One-line infra change | Slow path penalty for users still 60s on bad hits; doesn't help UX during the wait | Treats symptom |
| Move to async job + polling | Robust | Adds Aurora/DynamoDB job table; more moving parts | Overkill at PoC scale |
| Keep sync, just retry on timeout | Simple | Doubles cost on every miss | No |
| Bump model to Haiku (which we did separately, ADR-001) | Solves latency | Solves on the happy path; doesn't protect on bad days | Complementary, not alternative |

## Consequences

- **Positive**:
  - 504s eliminated — every call returns within 25s with either real
    LLM output or fallback
  - Users see live phase chips: `지식 그래프 조회 → KB 유사 사례 검색
    → Sonnet/Haiku 8D 작성`
  - SSE pattern reused by chat / insights → consistent UX across
    long-running flows
- **Trade-offs**:
  - CloudFront origin compression must stay disabled on SSE paths
    (chunks otherwise buffer to full); ADR-007 has rationale
  - Fallback content is deterministic Korean templates — useful for
    demo continuity but obviously not LLM output
- **Follow-ups**:
  - Apply same pattern to any future long-running Bedrock surface
  - Watch p95 — if Haiku 4.5 (post-ADR-001) routinely finishes in <10s,
    can tighten budget to 20s for faster fallback

## References

- Code: `api/routers/eight_d.py:_BEDROCK_BUDGET_S`, `_BEDROCK_POOL`
- Web: `web/lib/api-client.ts:eightDStream()`, phase chip rendering in
  `web/app/eight-d/page.tsx`
- CHANGELOG: `0.3.0 — 2026-05-09 § Features — feat(8d)`
