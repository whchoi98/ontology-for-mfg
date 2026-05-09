# data/CLAUDE.md

22-class ontology synthesizer + public-standards loaders + Neptune /
OpenSearch ingestion entry points. Generates ~10,644 nodes worth of
demo-ready synthetic data deterministically.

## Layout

```
data/
├── schemas.py                Pydantic models for the 22 ontology classes
├── load_graph.py             Bulk load to Neptune (openCypher + bom-edges flag)
├── load_search.py            Index docs into OpenSearch Serverless mfg-search
├── public/                   Real-world standards subsets (frozen)
│   ├── jedec.py              JESD22 / MO-220 / JESD51
│   ├── ipc.py                IPC-A-610 acceptance criteria
│   ├── aec_q.py              AEC-Q100/Q101/Q200 stress tests
│   ├── iso_iatf.py           IATF 16949 / ISO 9001 / ISO 26262 / ISO 50001
│   ├── reach_svhc.py         REACH SVHC ~250 substances
│   ├── rohs.py               RoHS 6+4 substances
│   ├── cbam.py               CBAM goods + emission factors
│   ├── us_trade.py           IRA 30D / USMCA / FEOC list
│   └── geo.py                7-country region metadata
├── synthetic/                Generators producing deterministic ndjson
│   ├── _bedrock.py           Optional Bedrock seed for LLM-assisted enrichment
│   ├── products.py           Product line × division (HA/HE/VS/INNOTEK/MAGNA)
│   ├── boms.py               Module / Component composition
│   ├── enrich_components.py  Bedrock-driven Korean naming / specs
│   ├── manufacturers.py      4-division top-level + JV
│   ├── suppliers.py          Tier-1 / Tier-2 with RFM seed
│   ├── customers.py          OEM customer accounts
│   ├── plants.py             7-country plant network
│   ├── lanes.py              Trade lanes with regulation tagging
│   ├── incidents.py          Quality incident archetypes
│   ├── telemetry.py          IoT vibration / temp / current / rpm
│   ├── maintenance.py        PM / CM / PdM events
│   └── esg.py                ESG indicators + carbon scope rollups
└── output/                   Generated ndjson (gitignored except this README)
```

## Generation flow

```bash
make data       # Runs every generator in dependency order
```

Order matters because synthesizers reference each other's ids:

```
products → manufacturers → boms → suppliers → customers → plants
       → lanes → incidents → telemetry → maintenance → esg
```

Re-running is idempotent within a run because each generator seeds its RNG
from a constant string (e.g. `random.Random("supplier")`). Across days the
output is stable; that's intentional for demo reproducibility.

## Loading into AWS

⚠️ **VPC-internal only** — Neptune sits in private subnets, OpenSearch
Serverless is data-access-policy gated. Run from an ECS Fargate task,
bastion inside the VPC, or via SSM port-forward.

```bash
NEPTUNE_ENDPOINT=https://...neptune.amazonaws.com:8182
OPENSEARCH_HOST=...aoss.amazonaws.com
AWS_REGION=ap-northeast-2

make load                     # schema + graph + search
make load-schema              # OWL/RDF (ontology/schema.ttl) → Neptune
make load-graph               # ndjson → openCypher (--bom-edges enables BOM)
make load-search              # ndjson → OpenSearch index
```

See [`docs/runbooks/data-load.md`](../docs/runbooks/data-load.md) for the
full procedure with verify queries.

## Key conventions

- **Pydantic 2** schemas in `schemas.py` are the source of truth; always
  align generators against them, not the spec doc
- **Deterministic seeds** — every `random.Random("...")` constant must stay
  the same across runs; do not change without bumping a version
- **Bedrock enrichment is optional** — `enrich_components.py` calls Bedrock
  when `MFG_BEDROCK_ENRICH=1`; otherwise it falls back to template Korean
  names. CI never enriches (cost + reproducibility)
- **public/ vs synthetic/** — `public/` modules are frozen sets of
  real-world standards / regulations / substances. Treat as read-only
  reference data; never randomize their content
- **Output ndjson** — one record per line, no header, UTF-8. Loaders stream
  these line-by-line into Neptune Bulk Loader / OpenSearch `_bulk`

## Gotchas

- **`from data.synthetic._bedrock import …`** can hang if Bedrock CRIP for
  ap-northeast-2 is degraded. Generators wrap with `try/except` and emit a
  warning, then fall back to deterministic Korean templates
- **Module dependency order is rigid** — running generators out of order
  produces references to ids that don't exist yet (e.g. boms before
  components). The Makefile enforces correct order
- **NDJSON line size** — some incident descriptions push past 8KB. Loaders
  must use `_bulk` API not point-PUT, and the Neptune bulk loader S3 path
  is preferred for >1k nodes
- **Geographic codes** — `data/public/geo.py` has 7 countries
  (KR/CN/VN/MX/PL/US/IN). The trade-lane simulator assumes exactly these
  for IRA/USMCA/CBAM tagging logic; adding a country requires updating
  `lanes.py` and `data/public/us_trade.py` together
