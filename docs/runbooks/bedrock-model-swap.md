# Runbook — Bedrock model swap (CRIP rotation)

- **Owner**: ontology-mfg-dev
- **Last reviewed**: 2026-05-15
- **Severity**: Standard
- **Scope**: Production + Dev

## Compatibility requirement (v0.5.6+)

**Any new chat-tier model must support the `converse_stream` API**, not
just `converse`. ADR-009 made `/api/chat` (and the AgentRunner backing
8D / insights when they migrate) token-streaming-only. A blocking-only
model would break the user-perceived TTFB invariant.

Check with:
```bash
aws bedrock list-foundation-models --region ap-northeast-2 \
  --query 'modelSummaries[?modelId==`<NEW_MODEL_ID>`].responseStreamingSupported'
```
Must return `[true]`. If not, the model is incompatible — pick a
streaming-capable alternative or open a follow-up to extend agent.py's
fallback path.

The Haiku 4.5 follow-up generator (`services/followups.py`) uses the
blocking `converse` and is unaffected — it's a single-shot 300-token
call where streaming buys nothing.

## When to use

- AWS rotates a Bedrock CRIP id (Cross-Region Inference Profile)
- A model degrades in latency / availability and you want to fail
  over to the alternate (Sonnet ↔ Haiku, or different region)
- Trying out a newer model version (Sonnet 4.7, Haiku 5.0, etc.)

## Pre-flight checks

```bash
# Confirm both models are accessible from the API task role
aws bedrock list-foundation-models --region ap-northeast-2 \
  --query 'modelSummaries[?contains(modelId, `claude`)].modelId' --output text

aws bedrock list-inference-profiles --region ap-northeast-2 \
  --query 'inferenceProfileSummaries[].inferenceProfileId' --output text
```

## Procedure

### Option 1 — Code change (commit + redeploy)

Edit `api/config.py`:

```python
sonnet_model: str = os.environ.get(
    "MFG_SONNET_MODEL_ID",
    "global.anthropic.claude-sonnet-4-6"     # ← change here
)
haiku_model: str = os.environ.get(
    "MFG_HAIKU_MODEL_ID",
    "global.anthropic.claude-haiku-4-5-20251001-v1:0"   # ← or here
)
```

Then commit + redeploy per `docs/runbooks/deploy-production.md`. Total
turnaround ~5 min.

### Option 2 — Env-var override (no code change)

Set the override in the ECS task definition env:

```bash
# Get current task def revision
aws ecs describe-task-definition \
  --task-definition ontology-mfg-dev-api \
  --region ap-northeast-2 \
  --query 'taskDefinition.containerDefinitions[0].environment'

# Edit the env list locally, register new revision, point service to it
# (this is best done via CDK in infra-cdk/lib/compute-stack.ts to
#  preserve declarative source of truth)
```

⚠️ For now we don't have CDK-driven env-var override in compute-stack —
prefer Option 1 (code change) for predictability.

### Option 3 — Per-call override (testing only)

The 8D writer reads `settings.haiku_model` at call time. For one-off
testing, you can monkey-patch `api/config.py:settings.haiku_model = "..."`
in a Python REPL inside the API container:

```bash
aws ecs execute-command --cluster ontology-mfg-dev-cluster \
  --task <task-id> --container api --interactive \
  --command "python3 -c 'from api.config import settings; print(settings.haiku_model)'"
```

(execute-command must be enabled on the service; currently it isn't —
treat this as theoretical.)

## Verification

After redeploy:

```bash
# 8D phase chip should show the new model name (Haiku 4.5 / Sonnet 4.6 / ...)
# Visit https://mfg-ontology.whchoi.net/eight-d, click an incident card,
# watch the third phase chip — label is derived from the actual runtime model

# CloudWatch — first 8D call after deploy should log the new model id
aws logs filter-log-events \
  --log-group-name /aws/ecs/ontology-mfg-dev-api \
  --start-time $(( $(date +%s)*1000 - 600000 )) \
  --filter-pattern "eight_d converse" \
  --region ap-northeast-2 \
  --query 'events[-5:].message' --output text
# Expected: "eight_d converse → model=<new-model-id> ..."
```

## Rollback

Code change route: `git revert <commit>` + redeploy.

If the new model causes 8D to start timing out → the 25s budget +
deterministic fallback (ADR-003) protects users; just revert at your
own pace.

## Related

- ADR-001 — Bedrock model routing rationale (Sonnet vs Haiku)
- `api/config.py` — model id env vars
- `api/services/eight_d_writer.py:48` — writer model selection
- `api/routers/eight_d.py:_short_model_label` — UI chip label mapping
- `scripts/label_communities.py:32` — graphify labeller model id
