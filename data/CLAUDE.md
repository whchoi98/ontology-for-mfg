# data/CLAUDE.md

22-class ontology synthesizer + public-standards loaders + Neptune /
OpenSearch ingestion entry points. Generates the demo graph
deterministically: **10,844 nodes (22 labels) / 31,119 edges (27
relationship types)** — 10,748 synthetic records + 96 reference nodes.
What gets loaded is defined by `ontology/registry.py`, not by this package.

## Layout

```
data/
├── schemas.py                Pydantic models for the 22 ontology classes (+ SupplyOffer)
├── reference.py              Region / Standard / Regulation / Substance nodes from public/
├── embedding.py              Document embeddings for mfg-search (Titan v2, 1024-d)
├── load_graph.py             Registry-driven Neptune loader (build → UNWIND/MERGE batches)
├── load_search.py            Recreate + seed the OpenSearch Serverless mfg-search index
├── public/                   Real-world standards subsets (frozen)
│   ├── jedec.py              JESD22 / MO-220 / JESD51
│   ├── ipc.py                IPC-A-610 acceptance criteria
│   ├── aec_q.py              AEC-Q100/Q101/Q200 stress tests
│   ├── iso_iatf.py           IATF 16949 / ISO 9001 / ISO 26262 / ISO 50001
│   ├── reach_svhc.py         REACH SVHC subset
│   ├── rohs.py               RoHS 6+4 substances
│   ├── materials.py          Benign constituent substances (real CAS, not SVHC / RoHS)
│   ├── cbam.py               CBAM goods + emission factors
│   ├── us_trade.py           IRA 30D / USMCA / FEOC list
│   └── geo.py                7-country region metadata
├── synthetic/                Generators producing deterministic ndjson
│   ├── pipeline.py           Whole dataset in memory (`--out DIR`) — used by tests
│   ├── _bedrock.py           Bedrock tool-use helper (retail pattern) — no generator calls it today
│   ├── products.py           Product line × division (HA/HE/VS/INNOTEK/MAGNA)
│   ├── boms.py               Module / Component composition (+ enrich + sourcing)
│   ├── sourcing.py           SUPPLIED_BY offers (leadtime/otd/unit_price_usd/moq) + MADE_OF
│   ├── enrich_components.py  Deterministic standards + substances per category (+ benign constituents)
│   ├── manufacturers.py      4-division top-level + JV
│   ├── suppliers.py          Tier-1 / Tier-2 with RFM seed
│   ├── customers.py          OEM customer accounts
│   ├── plants.py             7-country plant network + certifications
│   ├── lanes.py              Trade lanes with regulation tagging
│   ├── incidents.py          Quality incident archetypes (+ 8D reports, root causes)
│   ├── telemetry.py          IoT vibration / temp / current / rpm
│   ├── maintenance.py        PM / CM / PdM events
│   └── esg.py                ESG indicators + carbon scope rollups
└── output/                   Generated ndjson — 18 files (gitignored except this README)
```

## Generation flow

```bash
make data                              # every generator in dependency order
python -m data.synthetic.pipeline      # same dataset in one pass (optional --out DIR)
python -m data.load_graph --dry-run    # offline: per-label / per-rel counts + dangling FKs
```

Order matters because synthesizers reference each other's ids:

```
products → manufacturers → boms → suppliers → customers → plants
       → lanes → incidents → telemetry → maintenance → esg
```

(`boms` regenerates the deterministic supplier ids in memory, since
`suppliers.ndjson` is written after it.) Each generator uses fixed seeds, so
output is stable across runs and days — intentional for demo
reproducibility.

## Loading into AWS

⚠️ **VPC-internal only** — Neptune sits in private subnets, OpenSearch
Serverless is data-access-policy gated. Run from the one-shot ECS loader
task (`loader/run.sh`), a bastion inside the VPC, or via SSM port-forward.

```bash
NEPTUNE_ENDPOINT=https://...neptune.amazonaws.com:8182
OPENSEARCH_HOST=...aoss.amazonaws.com
AWS_REGION=ap-northeast-2

make load                     # schema + graph + search
make load-schema              # ontology/schema.ttl → Neptune (named-graph replace)
make load-graph               # data.load_graph --reset: wipe registry labels, load nodes + edges
make load-search              # recreate mfg-search index, embed + _bulk components
```

`load_graph.py` flags: `--reset`, `--dry-run`, `--nodes-only`,
`--allow-dangling`, `--batch-size N` (default 100). `--bom-edges` is a
deprecated no-op (every registry edge is loaded by default).
`load_search.py` flags: `--no-embed` (BM25-only — KNN then returns
nothing), `--keep-index` (append; duplicates docs on re-run).

See [`docs/runbooks/data-load.md`](../docs/runbooks/data-load.md) for the
full procedure with verify queries.

## Key conventions

- **`ontology/registry.py` is the contract** — labels, id fields, source
  files and edge derivation rules (FK, FK list, offer objects, joins) live
  there. Add a field that should become an edge → add an `EdgeSpec`; add a
  label → add a `NodeSpec`. Then `python -m ontology.build_ttl` and run
  `tests/integration/test_graph_contract.py`
- **List fields** — Neptune openCypher has no list properties. List fields
  become edges; the few the API reads as node props
  (`NodeSpec.serialized_lists`: standards, substances, regulations) are
  additionally stored comma-joined. API side: `api.services.neptune.list_prop()`
- **Pydantic 2** schemas in `schemas.py` are the source of truth for record
  shape; always align generators against them, not the spec doc
- **Deterministic seeds** — every `random.Random(...)` seed must stay the
  same across runs; do not change without bumping a version. New concerns
  (e.g. `sourcing.py`) get their own RNG so they don't reshuffle the BOM
- **Generation never calls Bedrock** — `enrich_components.py` is rule-based;
  `_bedrock.py` is an unused helper kept for parity with retail. `make data`
  needs no AWS credentials (only `load-search` embeds via Bedrock)
- **public/ vs synthetic/** — `public/` modules are frozen sets of
  real-world standards / regulations / substances (materialised as
  reference nodes by `reference.py`). Treat as read-only; never randomize
- **Empty substance list ≠ compliant** — clean demo parts declare benign
  substances from `public/materials.py`; an empty declaration reads as
  `insufficient_data` in Scenario E
- **Output ndjson** — one record per line, no header, UTF-8. The graph
  loader builds everything in memory and posts `UNWIND $rows … MERGE`
  batches over openCypher HTTP (SigV4); the search loader uses `_bulk`

## Gotchas

- **`--reset` at least once after a loader change** — `MERGE` is idempotent
  per node / edge, but edges written by older loader versions linger until
  the registry labels are DETACH-deleted (`make load-graph` always resets)
- **Dangling FKs abort the load** — `load_graph` exits if any FK value
  doesn't resolve to a node; fix the data or pass `--allow-dangling`
- **Search index is recreated** — AOSS VECTORSEARCH auto-assigns `_id`, so
  there are no upserts; a full load is delete → create → `_bulk`. The
  application id lives in `_source.id`
- **Embeddings need Bedrock** — the loader task role must be able to
  `InvokeModel` the embed model (`MFG_EMBED_MODEL_ID`, default
  `amazon.titan-embed-text-v2:0`); dimension must stay 1024 (index mapping +
  API query side)
- **Module dependency order is rigid** — running generators out of order
  produces references to ids that don't exist yet. The Makefile enforces
  correct order; `pipeline.py` mirrors it
- **Geographic codes** — `data/public/geo.py` has 7 countries
  (KR/CN/VN/MX/PL/US/IN). The trade-lane simulator assumes exactly these
  for IRA/USMCA/CBAM tagging logic; adding a country requires updating
  `lanes.py` and `data/public/us_trade.py` together
