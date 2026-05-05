"""OpenSearch Serverless index seeder for components + standards + incidents.

Index name: `mfg-search` (collection: `ontology-mfg-dev`).
Document shape: { id, label, name, category, text (searchable), standards[], embedding[] }.

The Bedrock Knowledge Base for unstructured RAG (sample sheets, 8D PDFs) is
provisioned by the AIStack (Phase 2 Task 32) and indexes S3 directly. This loader
populates the *structured* hybrid search index used by Scenario A.
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
from typing import Iterable

OUTPUT_DIR = Path(__file__).resolve().parent / "output"


def build_index_mapping(*, embedding_dim: int = 1024) -> dict:
    return {
        "settings": {
            "index": {"knn": True},
            "analysis": {
                "analyzer": {
                    "nori_korean": {
                        "type": "custom",
                        "tokenizer": "nori_tokenizer",
                        "filter": ["nori_part_of_speech", "lowercase"],
                    }
                }
            },
        },
        "mappings": {
            "properties": {
                "id":         {"type": "keyword"},
                "label":      {"type": "keyword"},
                "name":       {"type": "text", "analyzer": "nori_korean"},
                "category":   {"type": "keyword"},
                "standards":  {"type": "keyword"},
                "text":       {"type": "text", "analyzer": "nori_korean"},
                "embedding":  {"type": "knn_vector", "dimension": embedding_dim,
                               "method": {"name": "hnsw", "space_type": "cosinesimil"}},
            }
        },
    }


def document_for_component(comp: dict) -> dict:
    text = " ".join([
        comp.get("name", ""),
        f"category={comp.get('category', '')}",
        " ".join(comp.get("standards", [])),
        " ".join(comp.get("substances", [])),
    ])
    return {
        "id": comp["id"],
        "label": "Component",
        "name": comp.get("name"),
        "category": comp.get("category"),
        "standards": comp.get("standards", []),
        "text": text,
        # embedding to be filled in at index time by call to Cohere Embed v4
    }


def _iter_ndjson(path: Path) -> Iterable[dict]:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            yield json.loads(line)


def index_components(*, host: str, region: str, index_name: str = "mfg-search") -> int:
    """Bulk-index components. Embeddings deferred — first pass is BM25 only."""
    from opensearchpy import OpenSearch, RequestsHttpConnection
    from requests_aws4auth import AWS4Auth
    import boto3
    creds = boto3.Session().get_credentials()
    if creds is None:
        raise RuntimeError("No AWS credentials available for OpenSearch auth")
    # Use get_frozen_credentials() to properly refresh and get token
    frozen = creds.get_frozen_credentials()
    auth = AWS4Auth(frozen.access_key, frozen.secret_key, region, "aoss", session_token=frozen.token)
    client = OpenSearch(
        hosts=[{"host": host, "port": 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
    )
    # AOSS does not support specifying doc ID via index(); use create() or index without id
    # to let AOSS auto-assign. We embed the component id as a field inside the doc body.
    try:
        if not client.indices.exists(index_name):
            client.indices.create(index_name, body=build_index_mapping())
    except Exception as exc:
        # Index may already exist or AOSS doesn't support indices.exists — proceed
        print(f"[warn] index check/create: {exc}")
    n = 0
    for comp in _iter_ndjson(OUTPUT_DIR / "components.ndjson"):
        doc = document_for_component(comp)
        # AOSS: use index without explicit id (auto-assign) so POST /index/_doc is used
        client.index(index=index_name, body=doc)
        n += 1
    return n


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default=os.environ.get("OPENSEARCH_HOST"))
    p.add_argument("--region", default=os.environ.get("AWS_REGION", "ap-northeast-2"))
    args = p.parse_args()
    if not args.host:
        raise SystemExit("Set OPENSEARCH_HOST or pass --host")
    n = index_components(host=args.host, region=args.region)
    print(f"indexed {n} components into mfg-search")


if __name__ == "__main__":
    main()
