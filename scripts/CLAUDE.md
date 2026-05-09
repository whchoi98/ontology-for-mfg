# scripts/CLAUDE.md

One-shot Python utilities. Currently houses the graphify community
labeller; expand here for any analytical / one-time / migration helpers.

## Files

- `label_communities.py` — Read `graphify-out/graph.json`, group nodes by
  Louvain community, ask Bedrock Haiku 4.5 for a Korean 2–5 word label per
  community, then patch:
  - `web/public/codegraph/graph.json`  (adds top-level `community_labels` map)
  - `web/public/codegraph/graph.html`  (RAW_NODES `community_name` + LEGEND `label`)
  - `web/public/codegraph/GRAPH_REPORT.md`  (### headings + nav links)
  - `web/public/codegraph/community_labels.json`  (audit-friendly id→name map)

## When to re-run

Whenever the underlying graph changes — i.e. after `graphify update .`:

```bash
graphify update .
python3 scripts/label_communities.py
cp graphify-out/{graph.html,graph.json,GRAPH_REPORT.md,manifest.json} \
   web/public/codegraph/
```

The script is idempotent in spirit: 188 community labels × Bedrock Haiku
takes ~28s and ~$0.05 per run. If you re-run without changing the
underlying communities, you'll get the same labels (deterministic
seed + low temperature).

## Conventions

- **Bedrock model** — hardcoded to `global.anthropic.claude-haiku-4-5-20251001-v1:0`
  with `maxTokens=60`, `temperature=0.1`. Don't bump tokens — the LLM
  produces a single line and the regex post-processor strips quotes /
  trailing punctuation
- **Concurrency** — 8 concurrent Bedrock calls via
  `ThreadPoolExecutor(max_workers=8)`. Bedrock Haiku CRIP for
  ap-northeast-2 handles this comfortably; bump cautiously
- **Patching strategy** — regex search/replace anchored on `"cid": N` and
  `"label": "Community N"` so we only rewrite untouched defaults. Re-runs
  with custom labels in place are safe (won't be touched)
- **Audit file** — `community_labels.json` is the diff-friendly id→name
  ground truth. Code reviewers should look there, not at the patched
  graph.html

## Gotchas

- **AWS credentials** — uses default boto3 chain. On the dev EC2, that's
  the `VscodeServerStack-VSCode-Role`. Other roles may not have Bedrock
  access; the script will fail with `AccessDeniedException`
- **graphify-out/ is gitignored** — re-running `graphify update .` from
  the repo root regenerates it. The `web/public/codegraph/*` copies are
  the shipped snapshot
- **Vis-network CDN dependency** — `graph.html` loads
  `https://unpkg.com/vis-network/standalone/umd/vis-network.min.js`.
  Offline / strict-CSP environments need the script vendored locally

## Related

- `docs/decisions/ADR-004-codegraph-iframe.md` — iframe vs server render
- `web/lib/pdf-export.ts` — could be used by a future scripts/export-* helper
- [graphify CLI](https://github.com/safishamsi/graphify) — upstream tool
