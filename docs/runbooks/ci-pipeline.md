# CI pipeline runbook

`.github/workflows/ci.yml` runs three parallel jobs on every push and
pull-request to `main`. This runbook covers reproducing failures
locally and understanding the gates.

## Jobs at a glance

| Job | What it does | Local mirror |
|-----|--------------|--------------|
| `api` | `pip install` requirements, `pytest -v`, `ruff check`, `black --check` | `make venv && make test` |
| `web` | `npm ci`, `tsc --noEmit`, `next build` | `cd web && npm ci && npm run build` |
| `cdk` | `npm ci`, `npm test` (Jest invariants) | `cd infra-cdk && npm ci && npm test` |

All three run on Ubuntu (x86_64) — even though production runs ARM64,
CI tests pure-Python and pure-TS code that doesn't depend on the build
host architecture.

## Reproducing failures locally

### `api` job failed

```bash
# Match CI's Python 3.12 + clean venv
python3.12 -m venv .venv-ci
source .venv-ci/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest -v                        # the failing assertion
ruff check .                     # if ruff failed
black --check .                  # if black failed
```

Ruff and black failures are non-blocking (`|| true` in the workflow)
but should still be fixed — CI ignores them today as a courtesy, not as
a policy.

### `web` job failed

```bash
cd web
rm -rf node_modules .next
npm ci                           # not npm install — CI uses ci
./node_modules/.bin/tsc --noEmit
npm run build                    # also runs tsc internally
```

Common `web` failures:
- **TS error in a path you didn't touch** — likely a transitive type
  change. Run `tsc --noEmit` locally, fix at the source.
- **`next build` fails with "module not found"** — a new import wasn't
  added to `package.json`. Run `npm install <pkg>` and commit
  `package-lock.json`.
- **Build OOM** — `next build` peaks ~1.5GB. CI's ubuntu-latest has
  7GB; if it OOMs there, something added a huge dep. Investigate
  bundle size with `npm run analyze` if you've configured it.

### `cdk` job failed

```bash
cd infra-cdk
rm -rf node_modules
npm ci
npm test
```

The Jest suite locks two invariants:
- IAM scope on the ECS task role (must not grant `*` on Bedrock)
- CloudFront `/api/*` origin compression must be `false` (ADR-007)

If these fail, **don't** loosen the test. The invariant is load-bearing
for production correctness.

## Secrets / IAM expectations

CI runs without AWS credentials. None of the three jobs invoke real
AWS APIs — `api` mocks Bedrock / OpenSearch / Neptune in pytest;
`cdk` runs synth-only Jest; `web` runs `next build` without
calling `/api/*`.

If a future test needs AWS credentials, add a GitHub OIDC role and
scope it tightly. Do NOT use a long-lived access key.

## Deploy is NOT in CI

Image build, ECR push, and `aws ecs update-service` are **manual**
steps. CI only verifies code passes gates. See
`docs/runbooks/deploy-production.md` for the deploy procedure.

This is intentional: a green CI does not mean "production-ready". A
human must:
1. Bump runtime version strings (Sidebar.tsx, api/main.py, pyproject.toml)
2. Update CHANGELOG.md
3. Build + push images
4. Trigger ECS rolling deploy

The `release` skill (`~/.claude/skills/release/SKILL.md`) automates the
version-sync step.

## Adding a new job

Touch only `.github/workflows/ci.yml`. New jobs should:
- Run in parallel (independent `jobs:` entry, no `needs:` unless required)
- Pin language versions (Python 3.12, Node 20)
- Use `cache: pip` / `cache: npm` for the language setup action
- Fail fast — don't add `continue-on-error: true` without writing why
- Mirror locally — document the equivalent local command in this runbook

## When CI is red but locally green

The usual suspects, in order:
1. **Stale cache** — clear node_modules / .venv and reinstall locally
2. **Floating dep version** — CI gets a fresh resolve, you don't.
   Check `package-lock.json` / `requirements.txt` for unpinned ranges.
3. **Platform divergence** — CI is Ubuntu x86_64, dev EC2 is AL2023
   arm64. Pure Python and pure TS shouldn't care, but native deps
   (e.g., `gremlinpython` C extensions) sometimes do.
4. **Env var assumption** — pytest may depend on an env var you set
   locally without realizing. Add it to the CI step or stop depending
   on it.

## When CI is green but production breaks

This means the test surface is missing the failure mode. File an
issue against the test in `tests/integration/` first — every
contract regression should be locked by an integration test going
forward.
