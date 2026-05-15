.PHONY: data test clean load load-schema load-graph load-search venv

# ── developer venv (Python 3.12 per pyproject.toml) ───────────────────────────
venv:
	@command -v python3.12 >/dev/null 2>&1 || { echo "python3.12 required; on AL2023: sudo dnf install -y python3.12"; exit 1; }
	python3.12 -m venv .venv
	. .venv/bin/activate && pip install -U pip && pip install -r requirements.txt -r requirements-dev.txt
	@echo "Run: source .venv/bin/activate"


# ── synthetic data generation ─────────────────────────────────────────────────
data:
	python -m data.synthetic.products
	python -m data.synthetic.manufacturers
	python -m data.synthetic.boms
	python -m data.synthetic.suppliers
	python -m data.synthetic.customers
	python -m data.synthetic.plants
	python -m data.synthetic.lanes
	python -m data.synthetic.incidents
	python -m data.synthetic.telemetry
	python -m data.synthetic.maintenance
	python -m data.synthetic.esg

# ── data loading into AWS (MUST run from inside retail VPC) ──────────────────
# Neptune is in private subnets (VPC vpc-0dfa5610180dfa628).
# Run these targets from an ECS Fargate task, a bastion inside the VPC,
# or via SSM port-forward. They CANNOT be run from a public internet host.
#
# Required env vars:
#   NEPTUNE_ENDPOINT   https://ontology-mfg-dev-neptune.cluster-cd4nhqgutps9.ap-northeast-2.neptune.amazonaws.com:8182
#   OPENSEARCH_HOST    klhxy9avzighd1u2ugth.ap-northeast-2.aoss.amazonaws.com
#   AWS_REGION         ap-northeast-2

NEPTUNE_ENDPOINT ?= https://ontology-mfg-dev-neptune.cluster-cd4nhqgutps9.ap-northeast-2.neptune.amazonaws.com:8182
OPENSEARCH_HOST  ?= klhxy9avzighd1u2ugth.ap-northeast-2.aoss.amazonaws.com
AWS_REGION       ?= ap-northeast-2

load: load-schema load-graph load-search
	@echo "All data load steps complete."

load-schema:
	@echo "Uploading OWL/RDF schema to Neptune..."
	python3 -m ontology.upload --endpoint "$(NEPTUNE_ENDPOINT)" --schema ontology/schema.ttl

load-graph:
	@echo "Loading ~10,644 nodes + BOM edges into Neptune via openCypher..."
	NEPTUNE_ENDPOINT="$(NEPTUNE_ENDPOINT)" python3 -m data.load_graph --bom-edges

load-search:
	@echo "Indexing components into OpenSearch Serverless (mfg-search)..."
	OPENSEARCH_HOST="$(OPENSEARCH_HOST)" AWS_REGION="$(AWS_REGION)" python3 -m data.load_search

# ── verification queries (run from inside VPC after load) ────────────────────
verify-graph:
	@echo "Node count by label:"
	curl -ks "$(NEPTUNE_ENDPOINT)/openCypher" \
	  -H 'content-type: application/json' \
	  -d '{"query":"MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY n DESC LIMIT 25"}'

test:
	pytest -v

clean:
	rm -rf data/output/*.ndjson .pytest_cache __pycache__ */**/__pycache__
