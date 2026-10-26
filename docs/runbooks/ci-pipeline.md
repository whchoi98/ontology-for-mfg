# CI pipeline runbook

`.github/workflows/ci.yml` runs three parallel jobs on every push and
pull-request to `main`. This runbook covers reproducing failures
locally and understanding the gates.

## Jobs at a glance

| Job | What it does | Local mirror |
|-----|--------------|--------------|
| `api` | `pip install -r requirements.txt -r requirements-dev.txt`, `pytest -v`, `pip-audit -r requirements.txt`, `ruff check .`, `black --check .` | `make venv && make test && ruff check . && black --check .` |
| `web` | `npm ci`, `tsc --noEmit`, `npm test` (vitest), `npm audit --omit=dev --audit-level=high`, `next build` | `cd web && npm ci && npm test && npm run build` |
| `cdk` | `npm ci`, `npm test` (Jest invariants), `npm audit --audit-level=high` | `cd infra-cdk && npm ci && npm test` |

Python 3.12 and Node 24. `requirements.txt` is only
`-r api/requirements.txt -r loader/requirements.txt` — the exact pins the
images install — so pytest and `pip-audit` cover what actually ships.

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
pip-audit -r requirements.txt    # if pip-audit failed
ruff check .                     # if ruff failed (ruff check --fix . for autofixes)
black --check .                  # if black failed (black . to reformat)
```

Since v0.6.0 **ruff and black are blocking** (the `|| true` was removed).
A `pip-audit` finding means a shipped pin has a known vulnerability — bump
it in `api/requirements.txt` or `loader/requirements.txt` (never only in a
Dockerfile) and re-run the suite.

### `web` job failed

```bash
cd web
rm -rf node_modules .next
npm ci                           # not npm install — CI uses ci
./node_modules/.bin/tsc --noEmit
npm test                         # vitest (jsdom)
npm audit --omit=dev --audit-level=high
npm run build                    # also runs tsc internally
```

Plain `npm ci` must work — no `--legacy-peer-deps` (see the
`react-simple-maps` `overrides` note in `web/CLAUDE.md`). The 3 moderate
advisories in Tailwind 3's `postcss-selector-parser` chain are known
residue; they don't fail `--audit-level=high`.

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

The Jest suite (36 tests) locks, among others:
- IAM scope on the ECS task roles (no `Action:*` on `Resource:*`); the API
  task role may only *read* Neptune (`ReadDataViaQuery` / `GetQueryStatus`,
  ADR-002)
- CloudFront compression must be `false` on at least one behavior (ADR-007)
- Guardrail on the STANDARD tier via the APAC profile; topic modes
  IPConfidential / CompetitorDisparagement BLOCK, RegulationViolation /
  HazardousChemical NONE; MISCONDUCT LOW / HIGH (ADR-011)
- Bedrock KB deferred to post-deploy; AOSS data access policy lists the KB,
  loader and API task roles
- Neptune `engineVersion` 1.4.8.1 with Snapshot deletion / replace policy
- Lambda@Edge on `nodejs22.x`, redirecting to `/api/auth/login` and
  bypassing `/api/auth/*`; no custom resource sets Cognito passwords

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
- Pin language versions (Python 3.12, Node 24)
- Use `cache: pip` / `cache: npm` for the language setup action
- Fail fast — don't add `continue-on-error: true` without writing why
- Mirror locally — document the equivalent local command in this runbook

## When CI is red but locally green

The usual suspects, in order:
1. **Stale cache** — clear node_modules / .venv and reinstall locally
2. **Floating dep version** — CI gets a fresh resolve, you don't.
   Check `package-lock.json` / `requirements.txt` for unpinned ranges.
3. **Platform divergence** — CI is Ubuntu x86_64, dev EC2 is AL2023
   arm64. Pure Python and pure TS shouldn't care, but native wheels
   (e.g. `cryptography` behind `PyJWT[crypto]`) sometimes do.
4. **Env var assumption** — pytest may depend on an env var you set
   locally without realizing. Add it to the CI step or stop depending
   on it.

## When CI is green but production breaks

This means the test surface is missing the failure mode. File an
issue against the test in `tests/integration/` first — every
contract regression should be locked by an integration test going
forward.
