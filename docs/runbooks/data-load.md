# Runbook — Synthetic data regeneration + Neptune/AOSS load

- **Owner**: ontology-mfg-dev
- **Last reviewed**: 2026-05-09
- **Severity**: Standard
- **Scope**: Dev (loads only run inside the VPC)

## When to use

- After changing any synthetic generator under `data/synthetic/*`
- After updating `data/schemas.py` (Pydantic shapes)
- After updating real-world standards under `data/public/*`
- When validating fresh installs of Neptune / AOSS

## Pre-flight checks

```bash
# Local Python environment
python3 --version  # >= 3.12
pip list 2>/dev/null | grep -E "pydantic|opensearchpy|boto3"

# AWS credentials must allow Neptune + AOSS ingestion
aws sts get-caller-identity
# For dev EC2: VscodeServerStack-VSCode-Role works for OpenSearch
# Neptune needs to run from a VPC-internal host (bastion / ECS task / SSM)
```

## Procedure

### Step 1 — Regenerate synthetic ndjson (local, no AWS calls)

```bash
make data
```

Expected: prints each generator name in dependency order; produces
~13 ndjson files under `data/output/`. Each generator seeds its RNG
from a constant string so output is stable across runs.

```bash
# Sanity check — counts should match spec § 8.4 minimums
wc -l data/output/*.ndjson | sort -n
# Expected (approx):
#       4 manufacturers.ndjson
#      30 customers.ndjson
#      40 plants.ndjson
#      80 products.ndjson, eight_d_reports.ndjson, incidents.ndjson
#     150 suppliers.ndjson
#     200 modules.ndjson, root_causes.ndjson
#     300 sub_suppliers.ndjson
#     500 raw_materials.ndjson
#    2000 components.ndjson
#    5000 telemetry.ndjson
```

### Step 2 — Set environment for AWS load

⚠️ **Loads must run from inside the VPC** — Neptune is in private
subnets. Run from an ECS Fargate task, SSM-attached bastion, or via SSM
port-forward.

```bash
export NEPTUNE_ENDPOINT="https://ontology-mfg-dev-neptune.cluster-cd4nhqgutps9.ap-northeast-2.neptune.amazonaws.com:8182"
export OPENSEARCH_HOST="klhxy9avzighd1u2ugth.ap-northeast-2.aoss.amazonaws.com"
export AWS_REGION="ap-northeast-2"
```

### Step 3 — Schema (OWL/RDF) into Neptune

```bash
make load-schema
```

Pushes `ontology/schema.ttl` to Neptune via the SPARQL endpoint.
Idempotent — re-runs replace the schema.

### Step 4 — Graph nodes + BOM edges

```bash
make load-graph    # NEPTUNE_ENDPOINT must be set
```

Internally calls `python3 -m data.load_graph --bom-edges`. Expect ~10k
node creates + edge build to take 30–90s on a fresh cluster.

### Step 5 — Search index

```bash
make load-search   # OPENSEARCH_HOST + AWS_REGION must be set
```

Uses `_bulk` API to index components / standards / regulations into
the `mfg-search` index. Expect 30–60s.

## Verification

```bash
# Neptune node count by label (run from VPC)
make verify-graph
# Expected: 22 labels, total ~10,644 nodes

# OpenSearch document count
curl -ks -H "x-amz-aoss-collection-name: mfg-search" \
  "https://$OPENSEARCH_HOST/mfg-search/_count" \
  --aws-sigv4 "aws:amz:$AWS_REGION:aoss"
# Expected: { "count": 5000+, ... }

# Sanity check via the Web validation report
# https://mfg-ontology.whchoi.net/validation
# All 6 node-count rows should be green ✓ (≥ spec § 8.4 minimums)
```

## Rollback

Neptune supports openCypher delete — but for the demo we don't keep
prior snapshots. Safer recovery is "load-graph again from the previous
ndjson":

```bash
git checkout <prev-commit> -- data/output/
make load-graph
```

For OpenSearch, re-running `make load-search` overwrites the index
in place (`PUT _bulk` upserts by `_id`).

## Related

- ADR-008 — 22-class ontology + 12-scenario taxonomy
- `data/CLAUDE.md` — generator dependency order
- `Makefile` lines 17–44 — load target definitions
