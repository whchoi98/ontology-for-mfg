# Runbook — Production deploy (API + Web)

- **Owner**: ontology-mfg-dev
- **Last reviewed**: 2026-05-09
- **Severity**: Standard
- **Scope**: Production (mfg-ontology.whchoi.net)

## When to use

Any code-only change to `api/` or `web/`. **Infra changes** (new env var,
new IAM permission, new resource) require CDK — see `infra-cdk/CLAUDE.md`.

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

# Public smoke (302 = Cognito auth gate, expected)
curl -sS -o /dev/null -w "%{http_code} → %{redirect_url}\n" --max-redirs 0 \
  https://mfg-ontology.whchoi.net/

# Image-level verification (optional — confirm new build shipped)
docker run --rm --entrypoint sh \
  061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-mfg-dev-web:latest \
  -c "grep -c '<expected new string>' /app/.next/server/app/page.js"
```

## Rollback

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
- `infra-cdk/CLAUDE.md` — when CDK is needed instead
- `docs/runbooks/incident-response.md` — if deploy fails health checks
