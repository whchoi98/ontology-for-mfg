# ADR-009 — Token-level Bedrock streaming via `converse_stream`

- **Status**: Accepted
- **Date**: 2026-05-15
- **Supersedes**: parts of ADR-003 (which described phase-level SSE only)
- **Related**: ADR-007 (CloudFront SSE compression off)

## Context

`/api/chat` is the primary user-facing AI surface. Through v0.5.5 the
AgentRunner orchestrator called the blocking `bedrock_runtime().converse(...)`
API and yielded a single `delta` SSE event containing the entire assistant
text once Bedrock returned. Side-by-side with the sister project
`ontology-for-gcc`, users perceived mfg's chat as "frozen for ~3-5s, then
the whole answer appears" while gcc's chat painted text character-by-character.

The user-perceived TTFB (time to first byte) was the gap, not the
wall-clock total. Bedrock generates tokens incrementally; the blocking
API hides that from the caller. The streaming API surfaces it.

## Decision

Replace `bedrock_runtime().converse(...)` with
`bedrock_runtime().converse_stream(...)` in `api/services/agent.py`. Iterate
the resulting event stream and forward each text chunk as its own
SSE `delta` event the moment it arrives. Specifically:

- `contentBlockStart` with `toolUse` → buffer a new tool-call slot
- `contentBlockDelta` with `text` → `yield {"type": "delta", "text": chunk}`
  immediately (the load-bearing change)
- `contentBlockDelta` with `toolUse.input` → accumulate partial JSON
  chunks for that tool slot
- `messageStop` with `stopReason` → end this round; parse accumulated
  tool inputs as JSON; dispatch tools or return based on stopReason

Malformed tool-input JSON falls back to `{}` with a warning log — the
agent loop continues instead of crashing on a streaming-boundary edge case.

## Consequences

### Wins
- Time-to-first-byte drops from ~2-5s to ~300-600ms. Users perceive the
  agent as "live" instead of "stuck".
- Backpressure semantics on CloudFront and ALB align with the existing
  SSE invariants (no `ORIGIN_RESPONSE` Lambda@Edge, no origin compression —
  ADR-007). No edge changes required.
- The trace ring buffer, follow-up generator, and `suggested_followups`
  event all keep their existing wiring — they run on the accumulated
  assistant text after the stream closes.

### Costs
- Tool-input streaming is a footgun: `toolUse.input` arrives as partial
  JSON strings that **cannot** be `json.loads()`'d mid-stream. The
  accumulate-then-parse pattern is non-obvious; new tests
  (`test_agent_service.py::test_tool_call_dispatch`,
  `test_tool_input_invalid_json_falls_back_to_empty`) lock it in.
- Mocks in `test_agent_service.py` had to change from
  `mock.converse.return_value = {...}` to
  `mock.converse_stream.return_value = {"stream": [...]}`. Existing tests
  were updated; any future test author must use the new shape.

### Constraints
- Any new chat-tier Bedrock model **must** support the `converse_stream`
  API (not just `converse`). The current model id
  `global.anthropic.claude-sonnet-4-6` supports both. ADR-001's model
  routing table assumes streaming compatibility; cross-reference there
  before swapping.

## Alternatives considered

- **InvokeModelWithResponseStream** (legacy raw streaming API) — rejected:
  no native tool-use support; mfg relies on Converse's normalized
  tool-call protocol.
- **Server-Sent Events with periodic flush from buffered Converse** —
  rejected: would emit fake "chunks" that aren't real model state, and
  doesn't reduce real TTFB.
- **Keep `converse()` but emit per-sentence deltas** — rejected: same
  TTFB problem, just disguised.

## Operational notes

If users report chat feels slow again, check in this order:

1. `/healthz` returns 200 — service alive
2. CloudWatch logs `mfg.agent` round-start time vs first `delta` log
   line — confirms Bedrock is streaming, not the API buffering
3. `aws cloudfront get-distribution-config` — confirm `Compress: false`
   on `/api/*` origin (ADR-007)
4. Browser DevTools Network → SSE stream → see chunked arrival timing

See `docs/runbooks/sse-troubleshooting.md` for the full decision tree.
