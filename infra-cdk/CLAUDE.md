# infra-cdk/CLAUDE.md

AWS CDK v2 (TypeScript) — six stacks composing the entire ontology-mfg
deployment in account `061525506239` / region `ap-northeast-2`.

## Stack layout

```
infra-cdk/
├── bin/
│   └── app.ts                 Entrypoint — wires all 6 stacks with cross-stack deps
└── lib/
    ├── network-stack.ts       VPC reuse from ontology-retail-dev (cross-import via SSM)
    ├── data-stack.ts          Neptune cluster · OpenSearch Serverless (VECTORSEARCH)
    │                           · Aurora (memory) · Secrets Manager
    ├── ai-stack.ts            Bedrock Knowledge Base · Cognito User Pool ·
    │                           guardrail config
    ├── compute-stack.ts       ECR repos · ECS cluster · ApiService · WebService ·
    │                           ALB · target groups · IAM task roles
    ├── edge-stack.ts          CloudFront distribution · ACM cert (us-east-1) ·
    │                           Lambda@Edge · custom domain
    ├── observability-stack.ts CloudWatch alarms · log groups · dashboards
    └── lambda-edge/           Lambda@Edge functions (auth check, header injection)
```

## Deploy order (dependency)

```
network → data ─┬─ compute ─→ edge → observability
                └─ ai ──────→ compute  (Bedrock guardrail / KB ids)
```

## Common commands

```bash
cd infra-cdk
npm install
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

⚠️ **Code-only changes don't need CDK** — pushing a new image to ECR + an
ECS `update-service --force-new-deployment` is the day-to-day deploy
path. CDK is only for infrastructure changes (new env var, new IAM
permission, new resource). See `docs/runbooks/deploy-production.md`.

## Conventions

- **Cross-region cert** — ACM cert for CloudFront must live in `us-east-1`.
  `edge-stack.ts` uses the cross-region SSM pattern to import it
- **CloudFront origin compression DISABLED for SSE paths** — `/api/chat`,
  `/api/eight-d`, `/api/insights`, `/api/search` (when streaming). Without
  this, the buffer holds chunks until full and phase chips arrive in a
  single burst. ADR-007 has the rationale
- **VPC reuse from ontology-retail** — `network-stack.ts` imports the
  retail VPC by SSM-exported id; we don't run our own VPC. Subnet ids and
  security groups are passed as CDK context flags
- **Secrets** — Aurora master + any Bedrock-related credentials live in
  Secrets Manager (`ontology-mfg-dev-aurora-master-31d4d9` etc.); never
  CDK literal
- **Cognito LogoutURL** — `https://mfg-ontology.whchoi.net/` (with trailing
  slash). The API auth router normalizes; keep both consistent. ADR
  rationale: commit `eff662d`

## Gotchas

- **`infra-cdk/cdk.out/`** is large and frequently regenerated; gitignored
  but local clean-up after big diff sessions helps
- **Stack name prefix** — `ontology-mfg-dev-{network,data,compute,...}`. The
  `dev` segment is hardcoded; production deploy would need a parameterized
  context flag
- **EdgeStack deploys to us-east-1** but reads outputs from compute (in
  ap-northeast-2). cross-region SSM in CDK has subtle ordering issues —
  always deploy compute before edge
- **Lambda@Edge cold-start** — keep the function tiny and pure. Heavy
  imports (boto3) blow up CloudFront response time. Auth checks should
  rely on signed cookies / tokens, not service calls

## Related

- `docs/runbooks/deploy-production.md` — full deploy procedure
- `docs/runbooks/auth-cognito.md` — Cognito gotchas
- `docs/decisions/ADR-007-cloudfront-sse-compression.md` — origin compression
- `docs/deploy-logs/foundation-deploy.txt` — point-in-time first-deploy log
