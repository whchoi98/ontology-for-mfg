#!/usr/bin/env bash
set -euo pipefail
echo "[loader] $(date -u) — schema upload via SPARQL UPDATE"
python3 -m ontology.upload --endpoint "https://${NEPTUNE_HOST}:8182" --schema /app/ontology/schema.ttl
echo "[loader] $(date -u) — node + BOM edge load (openCypher MERGE)"
NEPTUNE_ENDPOINT="https://${NEPTUNE_HOST}:8182" python3 -m data.load_graph --bom-edges
echo "[loader] $(date -u) — OpenSearch index seed (Nori + KNN, components only)"
OPENSEARCH_HOST="${OPENSEARCH_HOST}" AWS_REGION="${AWS_REGION:-ap-northeast-2}" python3 -m data.load_search
echo "[loader] $(date -u) — done"
