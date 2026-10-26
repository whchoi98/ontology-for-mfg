# Runbook — Production deploy (API + Web)

- **Owner**: ontology-mfg-dev
- **Last reviewed**: 2026-10-26 (v0.7.0 — immutable image tags)
- **Severity**: Standard
- **Scope**: Production (mfg-ontology.whchoi.net)

## When to use

Any release of `api/` or `web/` (`scripts/deploy.sh`). Other infra changes
(new env var, new IAM permission, new resource) also go through CDK — see
`infra-cdk/CLAUDE.md`; a ComputeStack deploy keeps the tags in SSM.

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
5. **Images** — `scripts/deploy.sh` (Procedure below).

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

Since v0.7.0 every release is an **immutable image tag** (the 12-char git SHA)
rolled out by a CloudFormation update of ComputeStack — not `:latest` +
`force-new-deployment`. The ECR repos are `IMMUTABLE` (a pushed tag can
never be overwritten), and the tag each service runs is stored in SSM:

| SSM parameter | Read by |
|---|---|
| `/ontology-mfg-dev/image-tag/api` | `ApiTask` container image (`compute-stack.ts`) |
| `/ontology-mfg-dev/image-tag/web` | `WebTask` container image |

CloudFormation resolves both on **every** compute deploy, so an unrelated
infra change keeps the running builds. `scripts/deploy.sh` wraps the whole
sequence.

### Step 1 — Commit, then run the deploy script

```bash
git status --short          # must be empty — the tag names exactly one tree
scripts/deploy.sh           # both services at HEAD
scripts/deploy.sh --only api   # one service; the other keeps its SSM tag
```

What it does:

1. `tag=$(git rev-parse --short=12 HEAD)`; refuses a dirty tree
   (`ALLOW_DIRTY=1` produces a one-off `<sha>-dirty-<utc>` tag instead).
2. For each service: if `ontology-mfg-dev-<svc>:<tag>` is already in ECR it
   is reused; otherwise ECR login, `docker build --platform linux/arm64 -f
   <svc>/Dockerfile .` from the repo root, `docker push`.
3. Saves the current SSM values, writes the new tag.
4. `npx cdk deploy ontology-mfg-dev-compute --exclusively --force` (with the
   subnet / VPC context flags). `--force` because the template is usually
   unchanged — only the resolved SSM value differs. CloudFormation registers
   a new task definition revision and waits for the rolling deployment
   (`minHealthyPercent 100`: new tasks start before old ones stop).
5. On failure it **restores the previous SSM values**, so the next compute
   deploy does not retry the broken build. A build that fails its health
   checks is rolled back by the ECS deployment circuit breaker.
6. Prints each tag's digest next to the digests of the running tasks.

Measured at v0.7.0 (2026-10-26): 4 min 50 s for both images built and rolled
out (warm Docker cache); the CloudFormation rollout alone takes ~3 min 45 s.
A cold web build adds a few minutes.

⚠️ **If you see "Layer already exists" on every layer**, the build context
did not change. Likely culprits: building from inside `web/`, or a stale
`web/.next/` (excluded by `.dockerignore`; `rm -rf web/.next` if in doubt).

⚠️ **`tag invalid: The image tag '<tag>' already exists`** — the repo is
immutable. The script normally skips existing tags; this means the tag was
pushed by hand meanwhile. Use a new commit.

⚠️ **Do not `docker push :latest` + `update-service --force-new-deployment`**
any more. The task definitions no longer reference `:latest`, so such a
"deploy" redeploys the *old* tag, and ECR rejects re-pushing an existing tag.

## Verification

```bash
# Tag in SSM ↔ image in the active task definition ↔ digest of running tasks
for s in api web; do
  aws ssm get-parameter --name /ontology-mfg-dev/image-tag/$s \
    --region ap-northeast-2 --query Parameter.Value --output text
  aws ecs describe-services --cluster ontology-mfg-dev-cluster \
    --services ontology-mfg-dev-$s --region ap-northeast-2 \
    --query 'services[0].deployments[0].[taskDefinition,rolloutState]' --output text
done

# Public smoke — Lambda@Edge gate (302 → /api/auth/login, expected)
curl -sS -o /dev/null -w "%{http_code} → %{redirect_url}\n" --max-redirs 0 \
  https://mfg-ontology.whchoi.net/

# Login entrypoint — 307 → Cognito Hosted UI with &state=..., sets mfg_oauth_state
curl -sS -D - -o /dev/null --max-redirs 0 \
  https://mfg-ontology.whchoi.net/api/auth/login | grep -iE "^(location|set-cookie):"
```

## Rollback

Image rollback after an EdgeStack deploy is safe (see the order section
above). Rolling the **EdgeStack** back while the new API image is live is
not — roll the API image back first.

Every release stays in ECR under its SHA (the lifecycle policy keeps the
newest 30 images per repo), so a rollback is a deploy of an older tag — no
build, no re-tagging:

```bash
# Recent tags, newest first
aws ecr describe-images --repository-name ontology-mfg-dev-api \
  --region ap-northeast-2 \
  --query 'reverse(sort_by(imageDetails[?imageTags],&imagePushedAt))[:10].[imageTags[0],imagePushedAt]' \
  --output table

scripts/deploy.sh --only api --tag <previous-sha>
```

The ECS circuit breaker already reverts a deployment whose tasks never get
healthy; `--tag` is for a build that is healthy but wrong.

## Related

- ADR-007 — CloudFront SSE compression disabled
- ADR-011 — guardrail policy + `scripts/guardrail_probe.py` acceptance gate
- `docs/runbooks/auth-cognito.md` — OAuth `state` flow
- `infra-cdk/CLAUDE.md` — when CDK is needed instead
- `docs/runbooks/incident-response.md` — if deploy fails health checks
