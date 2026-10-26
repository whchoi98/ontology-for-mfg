# Runbook — Synthetic data regeneration + Neptune/AOSS load

- **Owner**: ontology-mfg-dev
- **Last reviewed**: 2026-10-24 (v0.6.0 — registry-driven loader)
- **Severity**: Standard
- **Scope**: Dev (loads only run inside the VPC)

## When to use

- After changing any synthetic generator under `data/synthetic/*`
- After updating `data/schemas.py` (Pydantic shapes)
- After changing `ontology/registry.py` (labels / edge rules)
- After updating real-world standards under `data/public/*`
- When validating fresh installs of Neptune / AOSS
- **At least once after upgrading to v0.6.0** — the old loader wrote only
  17 labels + BOM edges; a `--reset` load is required so stale edges don't
  linger

## Pre-flight checks

```bash
# Local Python environment (Makefile uses .venv/bin/python when present)
.venv/bin/python --version  # >= 3.12
.venv/bin/pip list 2>/dev/null | grep -E "pydantic|opensearch-py|boto3"

# AWS credentials must allow Neptune + AOSS ingestion
aws sts get-caller-identity
# Neptune + AOSS need a VPC-internal host (ECS loader task / bastion / SSM).
# The loader task role must be an AOSS data-access-policy principal
# (declared in infra-cdk/lib/ai-stack.ts) and may InvokeModel the embed
# model (MFG_EMBED_MODEL_ID, default amazon.titan-embed-text-v2:0).
# The API task role is read-only on Neptune — it cannot run this load.
```

## Procedure

### Step 1 — Regenerate synthetic ndjson (local, no AWS calls)

```bash
make data
```

Expected: prints each generator name in dependency order; produces
18 ndjson files under `data/output/`. Seeds are fixed, so output is stable
across runs.

```bash
# Sanity check — record counts per file
wc -l data/output/*.ndjson | sort -n
# Expected (v0.6.0):
#       4 manufacturers        30 customers          40 plants
#      50 sub_suppliers        80 products          100 esg_indicators
#     100 suppliers           104 certifications    120 esg_carbon_scopes
#     120 lanes               150 root_causes       200 eight_d_reports
#     200 raw_materials       300 incidents         392 modules
#     800 maintenance        2958 components       5000 telemetry
#   10748 total
```

### Step 2 — Offline graph build (no AWS calls)

```bash
.venv/bin/python -m data.load_graph --dry-run
```

Expected: `nodes: 10844 across 22 labels` (10,748 synthetic + 96 reference
Region / Standard / Regulation / Substance nodes) and
`edges: 31119 across 27 relationship types`. The command exits non-zero if
any FK value doesn't resolve to a node (dangling reference) — fix the data,
or pass `--allow-dangling` deliberately.

### Step 3 — Set environment for AWS load

⚠️ **Loads must run from inside the VPC** — Neptune is in private
subnets. Run the one-shot ECS loader task (`loader/run.sh` runs Steps 4–6
in order), an SSM-attached bastion, or via SSM port-forward.

```bash
export NEPTUNE_ENDPOINT="https://ontology-mfg-dev-neptune.cluster-cd4nhqgutps9.ap-northeast-2.neptune.amazonaws.com:8182"
export OPENSEARCH_HOST="klhxy9avzighd1u2ugth.ap-northeast-2.aoss.amazonaws.com"
export AWS_REGION="ap-northeast-2"
```

### Step 4 — Schema (OWL/RDF) into Neptune

```bash
make load-schema
```

Pushes `ontology/schema.ttl` (generated from the registry by
`python -m ontology.build_ttl`) to Neptune via SPARQL UPDATE. Idempotent —
the TTL lives in its own named graph, which is dropped before the insert,
and legacy default-graph triples are removed.

### Step 5 — Graph nodes + edges

```bash
make load-graph    # NEPTUNE_ENDPOINT must be set
```

Internally calls `python -m data.load_graph --reset`: DETACH DELETE every
node of the 22 registry labels (batched), then `UNWIND $rows … MERGE`
batches (100 rows) for all nodes and all 27 relationship types, SigV4-signed
openCypher. Useful flags when running the module directly: `--nodes-only`,
`--batch-size N`, `--allow-dangling`. `--bom-edges` is a deprecated no-op.

⚠️ `--reset` empties the graph first — scenarios see an empty / partial
graph (and use their synthetic fallbacks where they have one) until the
reload finishes.

### Step 6 — Search index

```bash
make load-search   # OPENSEARCH_HOST + AWS_REGION must be set
```

Embeds every component (Titan Text Embeddings v2, 1024-d, 8 workers) and
**recreates** the `mfg-search` index: delete → create (Nori + `knn_vector`
mapping) → `_bulk`. AOSS VECTORSEARCH collections auto-assign `_id`, so
there are no upserts — recreation is what keeps re-runs free of duplicates.
The application id is in `_source.id`. Flags: `--no-embed` (BM25-only,
KNN then returns nothing), `--keep-index` (append; duplicates on re-run).

## Verification

```bash
# Neptune node count by label (run from VPC)
make verify-graph
# Expected: 22 labels, total 10,844 nodes

# OpenSearch document count — components only
curl -ks -H "x-amz-aoss-collection-name: mfg-search" \
  "https://$OPENSEARCH_HOST/mfg-search/_count" \
  --aws-sigv4 "aws:amz:$AWS_REGION:aoss"
# Expected: { "count": 2958, ... }

# Sanity check via the Web validation report
# https://mfg-ontology.whchoi.net/validation
# All 6 node-count rows should be green ✓ (≥ spec § 8.4 minimums)
```

## Rollback

Neptune supports openCypher delete — but for the demo we don't keep
prior snapshots of the *data*. `data/output/` is gitignored, so recovery is
"regenerate from the previous generator / registry code, then reload" (the
reset makes this a clean replace):

```bash
git checkout <prev-commit> -- data/ ontology/
make data && make load-graph
```

For OpenSearch, re-running `make load-search` rebuilds the index from the
current ndjson (delete → create → `_bulk`).

## Related

- ADR-008 — 22-class ontology + 12-scenario taxonomy
- `ontology/registry.py` — labels, relationship types, edge derivation
- `data/CLAUDE.md` — generator dependency order, loader flags
- `tests/integration/test_graph_contract.py` — API Cypher ⊆ loader output
- `Makefile` — `load*` / `verify-graph` target definitions
