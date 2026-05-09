# ADR-006 — Neptune internal-id → application-id mapping in subgraph builders

- **Status**: Accepted
- **Date**: 2026-05-09
- **Related commit**: `262a61a`

## Context

Neptune openCypher results carry two flavors of node identifier:

- **Application id** (`n.id` property) — what the rest of the system uses
  (e.g. `AMZN-CMP-IC-00001`, `INC-2026-0412`)
- **Neptune internal id** (`~id`) — Neptune's storage primary key,
  surfaced on relationship `~start` / `~end` fields

When `api/routers/objects.py:_build_subgraph_for_id` returned a 1-hop
subgraph for the front-end, the previous code:

- Created node entries keyed by **application id**
- Created edge entries keyed by relationship `~start` / `~end` →
  **Neptune internal id**

That mismatch meant edges referenced ids that didn't exist in the
node set. Cytoscape throws synchronously on dangling edge endpoints,
which manifested as the **"Application error: a client-side exception
has occurred"** Next.js error overlay when users opened
`/objects/Product`, `/objects/Module`, or `/objects/Component`
(everything else fell through to the synthetic-fallback path and
worked by luck).

## Decision

In any subgraph builder that consumes Neptune openCypher rows:

1. Build a **`nep_to_app: dict[neptune_internal_id, app_id]` lookup** as
   nodes are processed
2. **Translate edge `~start` / `~end`** through the lookup before
   emitting
3. **Drop edges whose endpoints can't be resolved** to a node we
   exposed — never emit dangling edges to the client

Frontend `CytoscapeView` is also hardened (dedupe nodes, filter dangling
edges, try/catch on `cytoscape()`) so the worst-case rendering is a
small amber error pill instead of the full-page Next.js error overlay.

## Alternatives Considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Use `~id` for everything in node data | Single id space | Requires changing the front-end click handler and breaking the contract that nodes are keyed by app id | Larger blast radius |
| Frontend-only guard (drop dangling edges) | Smaller change | Backend still emits broken data; other consumers (Cytoscape exports, future API clients) hit the same bug | Symptom not cause |
| Skip subgraph endpoint entirely | Simple | Loses the 1-hop visualization that's central to the object explorer | No |

## Consequences

- **Positive**:
  - `/objects/Product` / `/Module` / `/Component` (and any future
    label with real Neptune data) renders cleanly
  - Pattern reusable for any future subgraph builder
  - Frontend defense-in-depth means partial Neptune drift can't crash
    the whole page
- **Trade-offs**:
  - Two-pass iteration over rows (build map first, then resolve
    edges); negligible at PoC scale
  - Adds ~30 lines per subgraph builder
- **Follow-ups**:
  - Apply the same pattern to any future server-side Cytoscape graph
    builder (e.g. spec-match standards subgraph already uses it)
  - Consider an integration test that fetches `/objects/Product` and
    asserts response is well-formed (no dangling edges)

## References

- Code: `api/routers/objects.py:_build_subgraph_for_id`,
  `web/components/CytoscapeView.tsx` (dangling-edge filter)
- CHANGELOG: `0.3.0 — 2026-05-09 § Fixes — fix(api+web)`
