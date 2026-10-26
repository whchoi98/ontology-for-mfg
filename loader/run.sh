#!/usr/bin/env bash
# One-shot ECS loader task: schema → graph → search, every step a full,
# idempotent replace driven by ontology/registry.py.
set -euo pipefail
echo "[loader] $(date -u) — schema upload via SPARQL UPDATE (named-graph replace)"
python3 -m ontology.upload --endpoint "https://${NEPTUNE_HOST}:8182" --schema /app/ontology/schema.ttl
echo "[loader] $(date -u) — graph full reload: reset + 22 labels + registry edges (openCypher UNWIND/MERGE)"
NEPTUNE_ENDPOINT="https://${NEPTUNE_HOST}:8182" python3 -m data.load_graph --reset
echo "[loader] $(date -u) — OpenSearch index recreate + seed (Nori + KNN embeddings, components)"
OPENSEARCH_HOST="${OPENSEARCH_HOST}" AWS_REGION="${AWS_REGION:-ap-northeast-2}" python3 -m data.load_search
echo "[loader] $(date -u) — done"
