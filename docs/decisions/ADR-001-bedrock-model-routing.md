# ADR-001 — Bedrock model routing: Sonnet 4.6 for chat, Haiku 4.5 for structured writers

- **Status**: Accepted
- **Date**: 2026-05-09
- **Related commit**: `e42810a`

## Context

The 8D writer (`api/services/eight_d_writer.py`) initially used
`global.anthropic.claude-sonnet-4-6` with `maxTokens=3000` and tool-use
enforcement on 8 required Korean string fields. Every call exceeded the
25s in-process budget, so the deterministic fallback fired every time.
CloudWatch logs showed the Bedrock call alone taking 30–40s consistently.

Meanwhile chat / insights need long-form Korean reasoning + multi-round
tool calls; that workload is genuinely a Sonnet workload.

## Decision

Split the Bedrock model surface by workload:

- **Sonnet 4.6** — `/api/chat` (B), `/api/insights` (C), the
  `AgentRunner` tool-use orchestrator
- **Haiku 4.5** — `/api/eight-d` writer (J), `scripts/label_communities.py`
  (graphify community labelling)

Both are CRIP ids, overridable via `MFG_SONNET_MODEL_ID` and
`MFG_HAIKU_MODEL_ID` env vars (`api/config.py`).

## Alternatives Considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Sonnet everywhere + bump CloudFront origin timeout 30s→60s | Single model, no routing logic | Slow path penalty for users; 504s only shifted, not eliminated; 8D structured output doesn't need Sonnet | Wrong tool for structured output |
| Haiku everywhere | Cheap, fast | Chat / insights long-form Korean reasoning visibly degraded | Unfit for /chat |
| Provisioned-throughput Sonnet | Latency drop ~30% | Significant cost | PoC scale doesn't justify |
| Move to OpenAI (gpt-4o-mini) | Faster | Cross-cloud auth, region | Out of scope |

## Consequences

- **Positive**:
  - 8D pipeline drops from ~36s (timeout + fallback) to 6–10s (real LLM)
  - Cost per 8D drops ~85%
  - Schema-enforced output suits Haiku's strengths (low writing freedom)
- **Trade-offs**:
  - Two model surfaces to monitor / migrate when AWS rotates CRIP ids
  - Phase chip label needs to track the actual runtime model
    (resolved in commit `ab44b9b`, see ADR follow-up)
- **Follow-ups**:
  - Add `MFG_8D_MODEL` env var that toggles between haiku/sonnet for
    A/B testing without code changes (next minor release)
  - Watch Bedrock pricing announcements — Haiku 4.5 cost may move

## References

- Code: `api/services/eight_d_writer.py:48`,
  `scripts/label_communities.py:32`, `api/config.py:18-19`
- CHANGELOG: `0.4.0 — 2026-05-09 § Features`
