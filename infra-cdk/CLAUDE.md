# infra-cdk/CLAUDE.md

AWS CDK v2 (TypeScript; aws-cdk-lib 2.274 · aws-cdk CLI 2.1146 · constructs
10.8) — six stacks composing the entire ontology-mfg deployment in account
`061525506239` / region `ap-northeast-2` (EdgeStack in `us-east-1`).

## Stack layout

```
infra-cdk/
├── bin/
│   └── app.ts                 Entrypoint — wires all 6 stacks with cross-stack deps
├── test/                      Jest invariants (36 tests) — run `npm test`
└── lib/
    ├── network-stack.ts       VPC reuse from ontology-retail-dev (cross-import via SSM)
    ├── data-stack.ts          Neptune 1.4.8.1 (serverless, DeletionPolicy Snapshot) ·
    │                           OpenSearch Serverless (VECTORSEARCH) · Aurora (memory) ·
    │                           S3 buckets · KMS keys · Secrets Manager
    ├── ai-stack.ts            Bedrock Guardrail (STANDARD tier, 4 topics) · KB IAM role ·
    │                           AOSS data access policy (KB / loader / API principals).
    │                           The Knowledge Base itself is NOT created here (post-deploy)
    ├── compute-stack.ts       ECR repos (IMMUTABLE tags, lifecycle) · ECS cluster ·
    │                           ApiService · WebService (image tag from SSM, circuit
    │                           breaker) · ALB · target groups · IAM task roles
    │                           (API: Neptune read-only)
    ├── edge-stack.ts          Cognito User Pool + app client + Hosted UI domain ·
    │                           CloudFront distribution · ACM cert (us-east-1) ·
    │                           Lambda@Edge · custom domain
    ├── observability-stack.ts CloudWatch alarms · log groups · dashboards
    └── lambda-edge/           index.js.tmpl — viewer-request auth redirect (no config)
```

## Deploy order (dependency)

```
network → data ─┬─ compute ─→ edge → observability
                └─ ai ──────→ compute  (imports `${prefix}-guardrail-id`)
```

## Common commands

```bash
cd infra-cdk
npm ci
npm test                       # Jest invariants (no AWS calls)
npx cdk synth                  # render templates (no AWS calls)
npx cdk diff                   # diff vs deployed (requires AWS auth)

# Single-stack deploy (most common)
npx cdk deploy ontology-mfg-dev-compute --require-approval never \
  --context retailVpcExportName=ontology-retail-dev-vpc-id \
  --context privateSubnetIds=subnet-07b1e65682847dce9,subnet-095297380cd45e1eb \
  --context publicSubnetIds=subnet-08486a1e618b1991e,subnet-0c161777c4031c320

# All stacks
npx cdk deploy --all --require-approval never <same context flags>
```

⚠️ **Releases go through ComputeStack** — `scripts/deploy.sh` pushes
`:<git sha>` (ECR repos are `IMMUTABLE`), writes it to SSM
`/ontology-mfg-dev/image-tag/{api,web}` and runs `cdk deploy
ontology-mfg-dev-compute --exclusively --force`. The task definitions read
the tag from SSM at deploy time (`valueForStringParameter`), so any compute
deploy keeps the running builds. Never `docker push :latest` +
`force-new-deployment` — the task definitions no longer reference `:latest`.
See `docs/runbooks/deploy-production.md`.

## Conventions

- **Cross-region cert** — ACM cert for CloudFront must live in `us-east-1`.
  `edge-stack.ts` uses the cross-region SSM pattern to import it
- **CloudFront compression DISABLED** — the distribution has a single
  default behavior (`compress: false`, caching disabled, Lambda@Edge at
  `VIEWER_REQUEST` only), which covers the SSE paths `/api/chat` and
  `/api/eight-d`. Without this, the buffer holds chunks until full and phase
  chips arrive in a single burst. ADR-007 has the rationale
- **Lambda@Edge is config-free** — it only checks for the `mfg_id_token`
  cookie and redirects to `/api/auth/login` (which owns the Cognito URL and
  OAuth `state`); all `/api/auth/*` paths bypass it. Runtime `nodejs22.x`.
  Keep the template free of build-time substitutions
- **Guardrail policy** — topic `mode: 'block' | 'detect'` in
  `GUARDRAIL_TOPICS` (detect = action NONE). Definitions describe the
  prohibited *intent*, never just regulation / chemical names. STANDARD tier
  needs the `apac.guardrail.v1:0` guardrail profile (CLASSIC is EN/FR/ES
  only). After any change: deploy the AI stack, run
  `python3 scripts/guardrail_probe.py`. ADR-011
- **Neptune IAM** — API task role gets `neptune-db:ReadDataViaQuery` +
  `neptune-db:GetQueryStatus` only (ADR-002); the loader task has its own
  (non-CDK) role for writes; CDK only attaches `LoaderEmbeddingPolicy`
  (`bedrock:InvokeModel` on Titan Embed v2) to it. Jest locks both
- **AOSS data access policy principals** — KB role, loader task role and API
  task role are listed by ARN *name* in `ai-stack.ts` (compute deploys after
  ai; the loader role isn't CDK-managed). Never hand-add principals in the
  console — the next CloudFormation update drops them
- **VPC reuse from ontology-retail** — `network-stack.ts` imports the
  retail VPC by SSM-exported id; we don't run our own VPC. Subnet ids and
  security groups are passed as CDK context flags
- **Secrets** — Aurora master + any Bedrock-related credentials live in
  Secrets Manager (`ontology-mfg-dev-aurora-master-31d4d9` etc.); never
  CDK literal. Demo user passwords are set out-of-band (1Password vault
  `ontology-mfg-demo`) — no `adminSetUserPassword` custom resource (Jest
  forbids it)
- **Cognito LogoutURL** — `https://mfg-ontology.whchoi.net/` (with trailing
  slash). The API auth router normalizes; keep both consistent. ADR
  rationale: commit `eff662d`

## Gotchas

- **ECS circuit breaker is set on the L1** — `addPropertyOverride(
  'DeploymentConfiguration.DeploymentCircuitBreaker', …)`. The L2
  `circuitBreaker` prop also adds `DeploymentController {Type: ECS}`, which
  CloudFormation treats as a *replacement* of the fixed-name services (Jest
  forbids the property)
- **Image-tag SSM parameters are created out-of-band** (by
  `scripts/deploy.sh` / the runbook), not by CDK — a CDK-owned parameter
  would reset the value on every deploy. A compute deploy fails at change-set
  creation if they are missing
- **AIStack ≠ Cognito / KB** — Cognito lives in EdgeStack (us-east-1). The
  Bedrock KB needs the AOSS vector index to exist first, which CloudFormation
  can't create, so `knowledgeBaseId` is `'pending-post-deploy'` (commit
  `878bbe0`)
- **Neptune engine upgrades** — minor bumps within 1.4.x are in-place via
  `engineVersion`. Never cross a major through CloudFormation: snapshot,
  upgrade with the CLI, then align the value (1.4.8.1 upgrade 2026-10-24,
  snapshot `ontology-mfg-dev-neptune-pre-1-4-8-1-20261024`)
- **AOSS rejects a no-op `UpdateAccessPolicy`** (InvalidRequest when the
  policy equals the live one) — change the `description` to force a real
  update when aligning IaC with live state
- **`infra-cdk/cdk.out/`** is large and frequently regenerated; gitignored
  but local clean-up after big diff sessions helps
- **Stack name prefix** — `ontology-mfg-dev-{network,data,compute,...}`. The
  `dev` segment is hardcoded; production deploy would need a parameterized
  context flag
- **EdgeStack deploys to us-east-1** but reads outputs from compute (in
  ap-northeast-2). cross-region SSM in CDK has subtle ordering issues —
  always deploy compute before edge
- **EdgeStack before an auth-changing API image** — the API's `/callback`
  requires the OAuth `state` that only the current Lambda@Edge flow
  (→ `/api/auth/login`) produces
- **Lambda@Edge cold-start** — keep the function tiny and pure. Heavy
  imports (boto3) blow up CloudFront response time. Auth checks should
  rely on signed cookies / tokens, not service calls

## Related

- `docs/runbooks/deploy-production.md` — full deploy procedure
- `docs/runbooks/auth-cognito.md` — Cognito gotchas
- `docs/decisions/ADR-007-cloudfront-sse-compression.md` — origin compression
- `docs/decisions/ADR-011-guardrail-policy.md` — guardrail tier / topic modes
- `docs/deploy-logs/foundation-deploy.txt` — point-in-time first-deploy log
