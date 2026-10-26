# scripts/CLAUDE.md

One-shot utilities: the release script, the graphify community labeller and
the guardrail false-positive probe. Expand here for any analytical / one-time /
migration helpers.

## Files

- `deploy.sh` — Releases api / web by **immutable tag** (12-char git SHA):
  builds + pushes only tags not yet in ECR, writes
  `/ontology-mfg-dev/image-tag/{api,web}` in SSM, runs `cdk deploy
  ontology-mfg-dev-compute --exclusively --force`, restores the previous SSM
  values if the stack update fails, then prints tag digest vs running
  digests. Refuses a dirty tree (`ALLOW_DIRTY=1` → `<sha>-dirty-<utc>`).
  `--only api|web`, `--tag <tag>` (rollback, no build). Procedure:
  `docs/runbooks/deploy-production.md`
- `label_communities.py` — Read `graphify-out/graph.json`, group nodes by
  Louvain community, ask Bedrock Haiku 4.5 for a Korean 2–5 word label per
  community, then patch:
  - `web/public/codegraph/graph.json`  (adds top-level `community_labels` map)
  - `web/public/codegraph/graph.html`  (RAW_NODES `community_name` + LEGEND `label`)
  - `web/public/codegraph/GRAPH_REPORT.md`  (### headings + nav links)
  - `web/public/codegraph/community_labels.json`  (audit-friendly id→name map)
- `guardrail_probe.py` — Measures the *deployed* Bedrock guardrail
  (`BEDROCK_GUARDRAIL_ID`, default `356xcbgyqcpq`; `BEDROCK_GUARDRAIL_VERSION`,
  default `DRAFT`; `AWS_REGION`) with `ApplyGuardrail(source=INPUT)`:
  - **must not block** — every demo sample prompt (parsed from
    `web/app/chat/page.tsx` `CHAT_SAMPLES` and `web/app/manny/page.tsx`
    `SAMPLE_QUERIES_BY_PERSONA`) + 12 ordinary compliance questions
    (`COMPLIANCE_QS`) — 43 prompts at v0.6.0
  - **should block or detect** — 10 held-out policy violations
    (`VIOLATIONS`, deliberately not copied from the topic examples)
  - prints `BLOCK` / `watch` (detect-mode hit) / `pass` per prompt and
    exits **1 if any benign prompt is blocked**

## When to re-run

Labeller — whenever the underlying graph changes, i.e. after `graphify update .`:

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

Probe — after any change to `GUARDRAIL_TOPICS` / content filters in
`infra-cdk/lib/ai-stack.ts` **and** deploying the AI stack, and after adding
demo sample prompts to `/chat` or `/manny`:

```bash
python3 scripts/guardrail_probe.py        # v0.6.0 baseline: 0/43 benign blocked
```

## Conventions

- **Bedrock model** — the labeller is hardcoded to
  `global.anthropic.claude-haiku-4-5-20251001-v1:0` with `maxTokens=60`,
  `temperature=0.1`. Don't bump tokens — the LLM produces a single line and
  the regex post-processor strips quotes / trailing punctuation. (Haiku 4.5
  still accepts `temperature`; the Sonnet 5.5 chat tier does not.)
- **Concurrency** — 8 concurrent Bedrock calls via
  `ThreadPoolExecutor(max_workers=8)`. Bedrock Haiku CRIP for
  ap-northeast-2 handles this comfortably; bump cautiously
- **Patching strategy** — regex search/replace anchored on `"cid": N` and
  `"label": "Community N"` so we only rewrite untouched defaults. Re-runs
  with custom labels in place are safe (won't be touched)
- **Audit file** — `community_labels.json` is the diff-friendly id→name
  ground truth. Code reviewers should look there, not at the patched
  graph.html
- **Probe sample sources are parsed, not imported** — if you rename
  `CHAT_SAMPLES` / `SAMPLE_QUERIES_BY_PERSONA` or change their literal
  shape, update `demo_samples()` in the probe too. Add new held-out
  violations rather than copying topic examples (that would only test
  memorisation)

## Gotchas

- **AWS credentials** — both scripts use the default boto3 chain. On the dev
  EC2, that's the `VscodeServerStack-VSCode-Role`. Other roles may not have
  Bedrock (`InvokeModel` / `ApplyGuardrail`) access; the scripts fail with
  `AccessDeniedException`
- **Probe hits the real guardrail** — it measures what is deployed, not
  what `ai-stack.ts` says. Run it only after `cdk deploy` of the AI stack
- **graphify-out/ is gitignored** — re-running `graphify update .` from
  the repo root regenerates it. The `web/public/codegraph/*` copies are
  the shipped snapshot
- **Vis-network CDN dependency** — `graph.html` loads
  `https://unpkg.com/vis-network/standalone/umd/vis-network.min.js`.
  Offline / strict-CSP environments need the script vendored locally

## Related

- `docs/decisions/ADR-004-codegraph-iframe.md` — iframe vs server render
- `docs/decisions/ADR-011-guardrail-policy.md` — guardrail tier / topic modes / probe baseline
- `web/lib/pdf-export.ts` — could be used by a future scripts/export-* helper
- [graphify CLI](https://github.com/safishamsi/graphify) — upstream tool
