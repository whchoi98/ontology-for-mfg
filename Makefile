.PHONY: data test clean load load-schema load-graph load-search venv

# Prefer the project venv (`make venv`); bare `python` does not exist on AL2023 and
# the system python3 is 3.9. Override with `make <target> PYTHON=...` elsewhere.
PYTHON ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python3)

# ── developer venv (Python 3.12 per pyproject.toml) ───────────────────────────
venv:
	@command -v python3.12 >/dev/null 2>&1 || { echo "python3.12 required; on AL2023: sudo dnf install -y python3.12"; exit 1; }
	python3.12 -m venv .venv
	. .venv/bin/activate && pip install -U pip && pip install -r requirements.txt -r requirements-dev.txt
	@echo "Run: source .venv/bin/activate"


# ── synthetic data generation ─────────────────────────────────────────────────
data:
	$(PYTHON) -m data.synthetic.products
	$(PYTHON) -m data.synthetic.manufacturers
	$(PYTHON) -m data.synthetic.boms
	$(PYTHON) -m data.synthetic.suppliers
	$(PYTHON) -m data.synthetic.customers
	$(PYTHON) -m data.synthetic.plants
	$(PYTHON) -m data.synthetic.lanes
	$(PYTHON) -m data.synthetic.incidents
	$(PYTHON) -m data.synthetic.telemetry
	$(PYTHON) -m data.synthetic.maintenance
	$(PYTHON) -m data.synthetic.esg

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
	$(PYTHON) -m ontology.upload --endpoint "$(NEPTUNE_ENDPOINT)" --schema ontology/schema.ttl

load-graph:
	@echo "Full graph reload (reset + ~10,844 nodes / 22 labels + 27 relationship types) via openCypher..."
	NEPTUNE_ENDPOINT="$(NEPTUNE_ENDPOINT)" $(PYTHON) -m data.load_graph --reset

load-search:
	@echo "Indexing components into OpenSearch Serverless (mfg-search)..."
	OPENSEARCH_HOST="$(OPENSEARCH_HOST)" AWS_REGION="$(AWS_REGION)" $(PYTHON) -m data.load_search

# ── verification queries (run from inside VPC after load) ────────────────────
verify-graph:
	@echo "Node count by label:"
	curl -ks "$(NEPTUNE_ENDPOINT)/openCypher" \
	  -H 'content-type: application/json' \
	  -d '{"query":"MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY n DESC LIMIT 25"}'

test:
	$(PYTHON) -m pytest -v

clean:
	rm -rf data/output/*.ndjson .pytest_cache __pycache__ */**/__pycache__
