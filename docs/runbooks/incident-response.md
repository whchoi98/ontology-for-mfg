# Runbook — Incident response

- **Owner**: ontology-mfg-dev
- **Last reviewed**: 2026-05-09
- **Severity**: Critical
- **Scope**: Production (mfg-ontology.whchoi.net)

## When to use

Any user-visible failure on the live demo. This runbook indexes the
incidents we've actually hit and how each was resolved, so triage
restarts from "what does this match?" not from scratch.

## Pre-flight — Quick triage (60s)

```bash
# 1. Are services healthy?
aws ecs describe-services \
  --cluster ontology-mfg-dev-cluster \
  --services ontology-mfg-dev-api ontology-mfg-dev-web \
  --region ap-northeast-2 \
  --query 'services[].{name:serviceName,running:runningCount,desired:desiredCount,state:deployments[0].rolloutState}' \
  --output table

# 2. Is the public endpoint reachable?
curl -sS -o /dev/null -w "%{http_code} → %{redirect_url}\n" --max-redirs 0 \
  https://mfg-ontology.whchoi.net/

# 3. Tail the last 5 minutes of API logs
START=$(($(date +%s) * 1000 - 300000))
aws logs filter-log-events \
  --log-group-name /aws/ecs/ontology-mfg-dev-api \
  --start-time $START --region ap-northeast-2 \
  --query 'events[-30:].[timestamp,message]' --output text
```

## Common symptoms → known fixes

### Symptom A — `/api/eight-d` returns 504 after 30s

**Cause**: Bedrock Sonnet 4.6 with `maxTokens=3000` tool-use exceeds
CloudFront's 30s origin response timeout.

**Fix shipped in v0.3.0**: SSE conversion + 25s in-process timeout +
deterministic fallback. See ADR-003.

**If you see this on current build**:
- Check `eight_d_writer.py` is using `settings.haiku_model` (ADR-001)
- If yes, Bedrock CRIP itself may be degraded — temporarily set
  `MFG_HAIKU_MODEL_ID=global.anthropic.claude-haiku-4-5-20251001-v1:0`
  to a different region's CRIP id

### Symptom B — `/objects/Product|Module|Component` shows "Application error"

**Cause**: Cytoscape throws synchronously when edges reference nodes not
in the element set. Was caused by Neptune `~start`/`~end` (internal id)
mismatching node app-ids.

**Fix shipped in v0.3.0**: ADR-006 — id-mapping pass + frontend
dangling-edge filter.

**If you see this on current build**:
- Check browser console for `Cannot create edge ... no node was found`
  → Neptune subgraph response has a new edge shape we're not mapping
- Check `api/routers/objects.py:_build_subgraph_for_id` for a regression

### Symptom C — Sidebar logout button → "Required String parameter 'redirect_uri' is not present"

**Cause**: Cognito does exact-match on `logout_uri` against the App
Client's registered LogoutURLs. A trailing-slash mismatch
(`https://mfg-ontology.whchoi.net` vs `https://mfg-ontology.whchoi.net/`)
makes Cognito ignore `logout_uri` and demand `redirect_uri`.

**Fix shipped**: `api/routers/auth.py` normalizes APP_BASE.

**If you see this**:
- Check `aws cognito-idp describe-user-pool-client ...` for the
  registered LogoutURLs
- Check `auth.py:logout()` builds the URL with the same trailing-slash

### Symptom D — Phase chips on `/chat` or `/eight-d` arrive in a single burst

**Cause**: CloudFront origin compression buffering SSE chunks until
the gzip buffer fills. ADR-007.

**If you see this**:
- Verify `infra-cdk/lib/edge-stack.ts` cache behavior for the affected
  path has `compress: false`
- Recently added SSE path? Add it to the no-compress behavior list

### Symptom E — `/codegraph/graph.html` 404

**Cause**: Next.js standalone output doesn't auto-copy `public/`.

**Fix shipped**: `web/Dockerfile` does `COPY --from=build /app/public ./public`.

**If you see this**:
- `docker run --rm --entrypoint sh <image> -c "ls /app/public/codegraph"`
  — must list the 4 codegraph files
- If empty, the Dockerfile regressed; restore the `COPY public` line

### Symptom F — 8D PDF download produces a blank page

**Cause**: `html2canvas` ran before Korean web fonts loaded.

**If you see this**:
- Try the export a second time (font is cached on second call)
- Check browser network tab for `Noto Sans KR` 200 OK
- If Persistent, vendor `Noto Sans KR` locally instead of relying on CDN

### Symptom G — `/validation` shows 6 grey unknown rows

**Cause**: `/api/ops/ingest` endpoint returning empty / erroring.

**If you see this**:
- `aws logs filter-log-events --log-group-name /aws/ecs/ontology-mfg-dev-api
  --filter-pattern 'ingest' --start-time $((... - 600000))`
- Most likely Neptune connectivity from the API task — check
  `_INGEST_FALLBACK_LABELS` is being returned (synthetic), which means
  Neptune query failed

## Escalation

If none of the above match:

1. Capture the failing request (curl command + browser network panel)
2. Pull the last 30 minutes of API logs (`aws logs filter-log-events`)
3. Check ECR image digests — has someone pushed in the last hour?
4. Roll back per `deploy-production.md § Rollback`

## Related

- All ADRs in `docs/decisions/`
- `docs/runbooks/deploy-production.md` — for rollback procedure
- `docs/runbooks/auth-cognito.md` — for symptom C
- `docs/runbooks/bedrock-model-swap.md` — for symptom A
