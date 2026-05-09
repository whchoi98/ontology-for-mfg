# ADR-004 — graphify code knowledge graph as same-origin iframe

- **Status**: Accepted
- **Date**: 2026-05-09
- **Related commit**: `ef2def9`

## Context

graphify (`pip install graphifyy`) is a developer-tooling CLI that maps a
source folder into a knowledge graph and emits a self-contained
`graph.html` (1.2MB, single file) plus `graph.json` and
`GRAPH_REPORT.md`. The user wanted this surfaced in the demo's sidebar
("개발자 도구 → 코드 지식 그래프") so audiences can see the project's
own code structure alongside the manufacturing ontology.

Two integration paths:

1. **Same-origin iframe** — copy graphify's static output into
   `web/public/codegraph/` and `<iframe src="/codegraph/graph.html">`.
2. **Server-side render** — parse `graph.json` and re-render via
   Cytoscape using our existing `CytoscapeView` component.

## Decision

**Same-origin iframe**. Generate via `graphify update .` (AST-only, no
LLM cost), copy outputs into `web/public/codegraph/`, and embed.

```
web/app/codegraph/page.tsx
  └── <iframe src="/codegraph/graph.html" />
```

Bedrock-driven community labelling (`scripts/label_communities.py`) runs
as a post-processing step that patches `graph.html` + `graph.json` +
`GRAPH_REPORT.md` in place with Korean 2–5 word community names.

## Alternatives Considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Server render via Cytoscape | Consistent with existing graph viewer; selectable text | Need to re-implement search/filter UI + community color cycling that graphify already does well | High effort, low marginal value |
| External hosted graphify | Zero work | Cross-origin, CSP, latency, demo control loss | No |
| Both: iframe primary + server-rendered fallback | Belt-and-braces | 2× maintenance | Premature optimization |

## Consequences

- **Positive**:
  - Zero re-implementation — graphify's interactive viewer (search,
    community filter, click-to-explore) ships unchanged
  - Same-origin → no CSP / CORS / auth headaches; sits behind Cognito
    naturally
  - 1.2MB HTML is acceptable static asset size
  - Bedrock community labels make graphify's default `Community 0..N`
    intuitive (e.g. "인사이트 분석 라우터", "8D 리포트 생성기")
- **Trade-offs**:
  - vis-network loaded from `unpkg.com` CDN (offline / strict-CSP
    environments need it vendored)
  - Graphify version bumps may change the JSON schema → need to re-test
    `label_communities.py` patching regex
  - Code-graph snapshot stale until manually regenerated; PR-bot
    automation deferred
- **Follow-ups**:
  - Vendor vis-network locally if any deploy environment needs offline
  - GitHub Action that re-runs `graphify update . && label_communities`
    on every PR + posts a community diff comment

## References

- Code: `web/app/codegraph/page.tsx`, `scripts/label_communities.py`,
  `web/public/codegraph/`
- CHANGELOG: `0.3.0 — 2026-05-09 § Highlights / Features`
