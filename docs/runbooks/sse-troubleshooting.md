# SSE troubleshooting runbook

When `/api/chat`, `/api/eight-d`, or `/api/insights` feels slow, hangs,
or drops mid-stream — work through this decision tree before paging
anyone.

## Quick symptom map

| User-visible symptom | Likely cause | Section |
|----------------------|--------------|---------|
| Chat hangs 5–10s, then whole answer appears at once | Token streaming broken (back to `converse()` behavior) | §1 |
| Chat starts streaming, then dies mid-response, no `stop` | Mid-stream exception or CloudFront idle-timeout | §2 |
| Chat returns immediately with one error chip | Bedrock auth / throttling | §3 |
| Stream never starts (spinner forever) | Upstream connection / ALB / Cognito | §4 |
| `suggested_followups` chips never appear | Follow-up generator failure | §5 |

---

## §1 — Token streaming broken (whole-answer batch)

**Expected behavior** (v0.5.6+, ADR-009): TTFB ~300-600ms, then text
flows character-by-character.

### Check 1: Confirm `converse_stream` is the code path
```bash
grep -n "converse_stream\|converse(" api/services/agent.py
```
Expect `converse_stream(**req)` at the call site, **no** `converse(**req)`.
If `converse` is present, the migration was reverted — that's the bug.

### Check 2: Confirm CloudFront `/api/*` origin compression is off
```bash
aws cloudfront get-distribution-config --id <DIST_ID> \
  --query 'DistributionConfig.CacheBehaviors.Items[?PathPattern==`/api/*`].Compress'
```
Expect `false`. If true, origin will gzip-buffer the SSE chunks (ADR-007).

### Check 3: Confirm no `ORIGIN_RESPONSE` Lambda@Edge on `/api/*`
```bash
grep -rn "ORIGIN_RESPONSE\|originResponse" infra-cdk/lib/edge-stack.ts
```
Expect zero matches. We only attach at `VIEWER_REQUEST` (auth). Anything
at `ORIGIN_RESPONSE` buffers the whole body.

### Check 4: Browser DevTools Network tab
- Open `/chat`, send a question, click the `/api/chat` request.
- **Response** tab should show chunks with timestamps spread over time.
- **Timing** tab should show a long "Content Download" period.
- If "Content Download" is near-zero and TTFB is huge → upstream is
  buffering.

---

## §2 — Mid-stream death (no `stop` event)

v0.5.5 added `try/except/finally` around the SSE generator in `chat.py`
specifically to surface this. Symptoms now produce a synthetic `error`
event + `stop` with `reason: stream_error` rather than a silent close.

### Check 1: CloudWatch logs `mfg.chat`
```bash
aws logs tail /aws/ecs/ontology-mfg-dev-api --follow \
  --filter-pattern "chat.gen() crashed mid-stream"
```
If the exception fires, the stack trace lands here via `log.exception(...)`.

### Check 2: ALB idle timeout
`ALB` default idle timeout is 60s. SSE keep-alive comments are emitted
every 15s by sse-starlette, so the connection should stay open
indefinitely under normal flow. If a `delta` doesn't arrive within 60s
(e.g., Bedrock genuinely paused) the ALB closes the upstream.

```bash
aws elbv2 describe-load-balancer-attributes \
  --load-balancer-arn <ALB_ARN> | grep idle_timeout
```
Bump to 300s if mid-stream long pauses are expected (rare with
Sonnet 4.6 at 2048 maxTokens).

### Check 3: CloudFront idle timeout
CloudFront has its own origin idle timeout (default 30s, configurable
to 60s). For SSE workloads we need 60s with `keep-alive` comments. If
unset, raise:
```bash
aws cloudfront update-distribution --id <DIST_ID> --distribution-config \
  '{...,"OriginConnectionAttempts":3,"OriginConnectionTimeout":10,"OriginReadTimeout":60,...}'
```

---

## §3 — Immediate Bedrock error

Symptoms: chat responds within 1–2s with `⚠️ Bedrock 모델 호출에 실패했습니다`
and `bedrock_error` stop reason. This is the agent's intentional error
surface (not a silent failure).

### Check 1: Which model failed?
The error chip includes the model id. Cross-reference
`CLAUDE.md` → "Tech Stack" → Bedrock model ids. The CRIP prefix matters
(`global.` vs `apac.`).

### Check 2: IAM permissions
```bash
aws bedrock-runtime invoke-model \
  --model-id global.anthropic.claude-sonnet-4-6 \
  --body '{"anthropic_version":"bedrock-2023-05-31","messages":[{"role":"user","content":"hi"}],"max_tokens":50}' \
  /tmp/out.json
```
Run this AS the API task role (`aws ecs execute-command` into a task).
If denied here, the task role lacks `bedrock:InvokeModel` on this
model. Check `infra-cdk/lib/compute-stack.ts` for the policy.

### Check 3: Cross-region inference profile availability
APAC inference profiles can be unavailable temporarily. Test with the
`global.` prefix first — it routes across AWS's global Bedrock fleet.
See `docs/runbooks/bedrock-model-swap.md`.

---

## §4 — Stream never starts

Symptoms: `/chat` UI shows the spinner indefinitely. No SSE events
arrive.

### Check 1: Is it actually `/api/chat`?
Browser DevTools → Network → confirm a `POST /api/chat` request is
fired. If not, the frontend bug is upstream of SSE.

### Check 2: Cognito redirect loop
If `POST /api/chat` returns 401 / 302, the user's `id_token` cookie
expired. The `handleUnauthorized` path in `web/lib/api-client.ts`
should surface this with `⚠️ 로그인 세션이 만료되었습니다`. If it
doesn't fire, the auth middleware may be returning a non-401 status
on unauth. Inspect `api/middleware_auth.py`.

### Check 3: ALB target health
```bash
aws elbv2 describe-target-health --target-group-arn <API_TG_ARN>
```
All targets should be `healthy`. Unhealthy targets get traffic rejected.

---

## §5 — `suggested_followups` chips never appear

The follow-up generator is fail-soft by design — failures degrade to
`[]` and the UI renders nothing instead of crashing.

### Check 1: Did the chat answer complete?
Follow-ups generate AFTER `stop` is emitted. If the chat stream
errored mid-stream, no follow-ups are generated.

### Check 2: Logs `mfg.followups`
```bash
aws logs tail /aws/ecs/ontology-mfg-dev-api --follow \
  --filter-pattern "followups generation failed"
```
The Haiku 4.5 follow-up call is throttled-prone (cheap model, busy).
If you see frequent failures, escalate to a higher inference profile
or implement a retry. Cost-wise, retrying 300-token calls is fine.

### Check 3: Is the Haiku model accessible?
Same procedure as §3 Check 2, but with the Haiku model id.

---

## When to escalate

- CloudFront / ALB config changes that aren't reversible from this
  runbook → page infra-on-call.
- Mid-stream death pattern repeating across multiple users in <10min
  → page bedrock-on-call (likely an upstream Bedrock incident).
- All four checks in any section pass but symptoms persist → file an
  incident per `docs/runbooks/incident-response.md`.
