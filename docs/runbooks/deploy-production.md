# Runbook — Production deploy (API + Web)

- **Owner**: ontology-mfg-dev
- **Last reviewed**: 2026-10-24 (v0.6.0)
- **Severity**: Standard
- **Scope**: Production (mfg-ontology.whchoi.net)

## When to use

Any code-only change to `api/` or `web/`. **Infra changes** (new env var,
new IAM permission, new resource) require CDK — see `infra-cdk/CLAUDE.md`.

## Deploy order when a release touches infra (v0.6.0 and later)

When CDK stacks change in the same release as the images, deploy in this
order — **EdgeStack before the new API image** is mandatory for auth
changes:

1. **DataStack** (only if `data-stack.ts` changed). Neptune engine bumps:
   minor versions within 1.4.x are in-place; never cross a major through
   CloudFormation — snapshot + CLI upgrade first, then align
   `engineVersion`. (v0.6.0's 1.4.7.0 → 1.4.8.1 was applied 2026-10-24,
   snapshot `ontology-mfg-dev-neptune-pre-1-4-8-1-20261024`.)
2. **AIStack** (guardrail tier / topics, AOSS access policy), then run
   `python3 scripts/guardrail_probe.py` — must print
   `blocked benign prompts: 0/…` (exit 0). Do this before the API image so
   the new input/output checks run against the Korean-capable STANDARD
   guardrail, not the old CLASSIC one.
3. **ComputeStack** (IAM — e.g. Neptune read-only role).
4. **EdgeStack** (us-east-1 — Lambda@Edge, Cognito). Wait until the
   distribution is fully deployed (Lambda@Edge replicas update globally):
   ```bash
   aws cloudfront wait distribution-deployed --id <DIST_ID>
   ```
5. **Images** — Steps 1–4 below (API + web).

Why the edge goes first: since v0.6.0 `/api/auth/callback` rejects a login
without a matching OAuth `state` (`400 invalid_oauth_state`). Only the new
Lambda@Edge sends unauthenticated viewers to `/api/auth/login`, which sets
the `mfg_oauth_state` cookie. Old edge + new API = every edge-initiated
login fails. New edge + old API still works (old `/login` and `/callback`
ignore `state`), so this order is also safe to roll back.

## Pre-flight checks

```bash
# Confirm AWS identity is the deploy role
aws sts get-caller-identity --query Arn --output text
# Expected: arn:aws:sts::061525506239:assumed-role/VscodeServerStack-VSCode-Role/...

# Confirm services are healthy before the deploy
aws ecs describe-services \
  --cluster ontology-mfg-dev-cluster \
  --services ontology-mfg-dev-api ontology-mfg-dev-web \
  --region ap-northeast-2 \
  --query 'services[].{name:serviceName,running:runningCount,state:deployments[0].rolloutState}' \
  --output table
# Expected: each service running 2/2, state COMPLETED
```

## Procedure

### Step 1 — Build container images (parallel)

From the project root (`/home/ec2-user/my-project/ontology-for-mfg`):

```bash
# API
docker build --platform linux/arm64 \
  -f api/Dockerfile \
  -t 061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-mfg-dev-api:latest .

# Web (in a second shell or with `&` for parallel)
docker build --platform linux/arm64 \
  -f web/Dockerfile \
  -t 061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-mfg-dev-web:latest .
```

Expected: each build ends with
`naming to 061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-mfg-dev-{api,web}:latest done`.

If you see `ERROR: could not find web` — you're not at the project root.
`cd` and retry.

### Step 2 — ECR login + push

ECR auth tokens last 12 hours; refresh on every deploy:

```bash
aws ecr get-login-password --region ap-northeast-2 \
  | docker login --username AWS --password-stdin \
    061525506239.dkr.ecr.ap-northeast-2.amazonaws.com

docker push 061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-mfg-dev-api:latest
docker push 061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-mfg-dev-web:latest
```

Expected: each push ends with
`<digest>: digest: sha256:... size: 2205-2623`.

⚠️ **If you see "Layer already exists" on every layer**, your local
image hasn't actually changed. Likely culprits:
- You ran `docker build` from inside `web/` instead of project root
- `web/.next/` from a previous local `npm run dev` poisoned the build
  context — wipe with `rm -rf web/.next` and rebuild

⚠️ **If you see "denied: User ... is not authorized to perform:
ecr:InitiateLayerUpload"**, your docker token has rotated to a
different IAM role. Re-run the `aws ecr get-login-password | docker
login` step.

### Step 3 — Force ECS rolling deploy

```bash
aws ecs update-service --cluster ontology-mfg-dev-cluster \
  --service ontology-mfg-dev-api --force-new-deployment \
  --region ap-northeast-2 \
  --query 'service.deployments[0].rolloutState' --output text

aws ecs update-service --cluster ontology-mfg-dev-cluster \
  --service ontology-mfg-dev-web --force-new-deployment \
  --region ap-northeast-2 \
  --query 'service.deployments[0].rolloutState' --output text
```

Expected: each prints `IN_PROGRESS`.

### Step 4 — Wait for steady state

```bash
aws ecs wait services-stable \
  --cluster ontology-mfg-dev-cluster \
  --services ontology-mfg-dev-api ontology-mfg-dev-web \
  --region ap-northeast-2
```

Typical wait: 2–4 minutes (rolling deploy + ALB target group
deregistration delay).

## Verification

```bash
# Service state should be PRIMARY only, COMPLETED, 2/2 running
aws ecs describe-services \
  --cluster ontology-mfg-dev-cluster \
  --services ontology-mfg-dev-api ontology-mfg-dev-web \
  --region ap-northeast-2 \
  --query 'services[].{name:serviceName,running:runningCount,deploys:length(deployments),state:deployments[0].rolloutState}' \
  --output table

# Public smoke — Lambda@Edge gate (302 → /api/auth/login, expected)
curl -sS -o /dev/null -w "%{http_code} → %{redirect_url}\n" --max-redirs 0 \
  https://mfg-ontology.whchoi.net/

# Login entrypoint — 307 → Cognito Hosted UI with &state=..., sets mfg_oauth_state
curl -sS -D - -o /dev/null --max-redirs 0 \
  https://mfg-ontology.whchoi.net/api/auth/login | grep -iE "^(location|set-cookie):"

# Image-level verification (optional — confirm new build shipped)
docker run --rm --entrypoint sh \
  061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-mfg-dev-web:latest \
  -c "grep -c '<expected new string>' /app/.next/server/app/page.js"
```

## Rollback

Image rollback after an EdgeStack deploy is safe (see the order section
above). Rolling the **EdgeStack** back while the new API image is live is
not — roll the API image back first.

ECR tag `latest` is the current pointer. To roll back, push the previous
image's digest as `latest`:

```bash
# Find the previous image digest
aws ecr describe-images \
  --repository-name ontology-mfg-dev-api \
  --region ap-northeast-2 \
  --query 'imageDetails[*].{digest:imageDigest,pushedAt:imagePushedAt,tags:imageTags}' \
  --output table

# Tag the previous digest as :latest and push
docker pull 061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-mfg-dev-api@sha256:<prev>
docker tag <prev> 061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-mfg-dev-api:latest
docker push 061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-mfg-dev-api:latest

# Force redeploy
aws ecs update-service --cluster ontology-mfg-dev-cluster \
  --service ontology-mfg-dev-api --force-new-deployment --region ap-northeast-2
```

## Related

- ADR-007 — CloudFront SSE compression disabled
- ADR-011 — guardrail policy + `scripts/guardrail_probe.py` acceptance gate
- `docs/runbooks/auth-cognito.md` — OAuth `state` flow
- `infra-cdk/CLAUDE.md` — when CDK is needed instead
- `docs/runbooks/incident-response.md` — if deploy fails health checks
