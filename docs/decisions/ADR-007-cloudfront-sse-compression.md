# ADR-007 — Disable CloudFront origin compression for SSE paths

- **Status**: Accepted
- **Date**: 2026-05-05
- **Related commit**: `d480108`

## Context

CloudFront defaults to compressing origin responses. For Server-Sent
Events (SSE), compression buffers the response stream — the gzip
encoder waits for enough bytes before flushing. With our event sizes
(~50–500 bytes each), CloudFront would hold all events until either a
buffer threshold or the connection closed, then ship them in a single
burst.

Symptom from the user side: "phase chips don't appear during the run,
they all show up at once at the end". From the API container side:
`yield` happens immediately, but the browser sees nothing for tens of
seconds.

Affected paths: `/api/chat`, `/api/eight-d`, `/api/insights`, and the
SSE variant of `/api/search`.

## Decision

**Set `compress=false` on the CloudFront cache behavior** for SSE
paths. Implemented in `infra-cdk/lib/edge-stack.ts`.

The non-SSE paths (regular JSON POST/GET) keep compression enabled —
they're typically larger (1–50KB JSON bodies) and benefit from gzip.

## Alternatives Considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Disable compression globally | Simple | Loses gzip on JSON / HTML / static assets where it does help | Worse default |
| `Content-Encoding: identity` header from API | More targeted | Some intermediate proxies still re-compress | Doesn't fully control behavior |
| WebSocket instead of SSE | True bidirectional | Connection management, sticky sessions, ALB target group changes | Overkill — we don't need bidirectional |
| Route SSE to a separate ALB without CloudFront | Bypass entirely | Defeats CloudFront's purpose (TLS, custom domain, edge geography) | No |

## Consequences

- **Positive**:
  - Phase chips render in real-time on chat / 8D / insights / search
  - No additional code per-router (centralized at CDN config)
  - Pure infra change, zero application-layer surface
- **Trade-offs**:
  - SSE responses don't benefit from gzip — but they're small per-event
    so impact is minimal
  - Need to remember this when adding new SSE paths — update CDN config
    too
- **Follow-ups**:
  - Document the SSE path list in the CDK stack as a comment so future
    additions are visible
  - Add a CDN smoke-test that verifies a known SSE path streams events
    incrementally (curl + line-by-line stdout check)

## References

- Code: `infra-cdk/lib/edge-stack.ts` (cache behavior config)
- CHANGELOG: this commit predates the structured CHANGELOG; surfaces in
  `0.3.0 § Internal` mentions
