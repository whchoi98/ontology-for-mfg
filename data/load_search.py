"""OpenSearch Serverless index seeder for components (Scenario A search / D spec-match).

Index name: `mfg-search` (collection: `ontology-mfg-dev`; override with
OPENSEARCH_INDEX). Document `_source` shape — the contract read by
`api/routers/search.py` / `spec_match.py` (`{"id": h["_id"], **h["_source"]}`,
so `_source.id` wins and carries the application id):

    { id, label, name, category, standards[], substances[], text, embedding[1024] }

AOSS VECTORSEARCH collections don't accept caller-chosen `_id`s, so documents
are auto-id'd and a *full load recreates the index* (delete → create →
`_bulk`) — re-running never duplicates documents. Embeddings come from
`data.embedding` (same model / dimension as the API's query embedding);
`--no-embed` indexes BM25-only documents (KNN then returns nothing).

The Bedrock Knowledge Base for unstructured RAG (sample sheets, 8D PDFs) is not
created by CloudFormation — AIStack only provisions its role and AOSS access
(the KB needs its vector index first; a post-deploy step). This loader populates
the *structured* hybrid search index.
"""

from __future__ import annotations

import argparse
import json
import os
from collections.abc import Callable, Iterable
from pathlib import Path

from data.embedding import EMBED_DIM, embed_documents, make_embedder

OUTPUT_DIR = Path(__file__).resolve().parent / "output"
DEFAULT_INDEX = os.environ.get("OPENSEARCH_INDEX", "mfg-search")
BULK_CHUNK = 100


def build_index_mapping(*, embedding_dim: int = EMBED_DIM) -> dict:
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
                "id": {"type": "keyword"},
                "label": {"type": "keyword"},
                "name": {"type": "text", "analyzer": "nori_korean"},
                "category": {"type": "keyword"},
                "standards": {"type": "keyword"},
                "substances": {"type": "keyword"},
                "text": {"type": "text", "analyzer": "nori_korean"},
                "embedding": {
                    "type": "knn_vector",
                    "dimension": embedding_dim,
                    "method": {"name": "hnsw", "space_type": "cosinesimil"},
                },
            }
        },
    }


def _reference_titles() -> tuple[dict[str, str], dict[str, str]]:
    from data.reference import standards, substances

    return (
        {s["id"]: s["title"] for s in standards()},
        {s["cas_id"]: s["name"] for s in substances()},
    )


def document_for_component(
    comp: dict,
    *,
    standard_titles: dict[str, str] | None = None,
    substance_names: dict[str, str] | None = None,
) -> dict:
    standard_titles = standard_titles or {}
    substance_names = substance_names or {}
    stds = list(comp.get("standards") or [])
    subs = list(comp.get("substances") or [])
    text = " ".join(
        filter(
            None,
            [
                comp.get("name", ""),
                f"category={comp.get('category', '')}",
                " ".join(stds),
                " ".join(standard_titles.get(s, "") for s in stds),
                " ".join(subs),
                " ".join(substance_names.get(s, "") for s in subs),
            ],
        )
    )
    return {
        "id": comp["id"],  # application id (AOSS assigns its own _id)
        "label": "Component",
        "name": comp.get("name"),
        "category": comp.get("category"),
        "standards": stds,
        "substances": subs,
        "text": text,
    }


def _iter_ndjson(path: Path) -> Iterable[dict]:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            yield json.loads(line)


def build_documents(
    output_dir: Path = OUTPUT_DIR,
    *,
    embed: Callable[[str], list[float]] | None = None,
    workers: int = 8,
) -> list[dict]:
    """Component documents; with `embed`, each gets an `embedding` vector."""
    titles, names = _reference_titles()
    docs = [
        document_for_component(c, standard_titles=titles, substance_names=names)
        for c in _iter_ndjson(Path(output_dir) / "components.ndjson")
    ]
    if embed is not None and docs:
        for doc, vec in zip(
            docs, embed_documents([d["text"] for d in docs], embed, workers=workers), strict=False
        ):
            doc["embedding"] = vec
    return docs


def bulk_body(index_name: str, docs: list[dict]) -> str:
    """`_bulk` NDJSON without `_id` (AOSS VECTORSEARCH auto-assigns ids)."""
    action = json.dumps({"index": {"_index": index_name}})
    return "".join(f"{action}\n{json.dumps(d, ensure_ascii=False)}\n" for d in docs)


def recreate_index(client, index_name: str, mapping: dict) -> None:
    """Drop + create so a full load is idempotent (no `_id` upserts on AOSS)."""
    from opensearchpy.exceptions import NotFoundError

    try:
        client.indices.delete(index=index_name)
    except NotFoundError:
        pass
    client.indices.create(index=index_name, body=mapping)


def bulk_index(client, index_name: str, docs: list[dict], *, chunk: int = BULK_CHUNK) -> int:
    ok = 0
    failures: list[str] = []
    for i in range(0, len(docs), chunk):
        part = docs[i : i + chunk]
        res = client.bulk(body=bulk_body(index_name, part))
        for item in res.get("items", []):
            r = item.get("index") or item.get("create") or {}
            if int(r.get("status", 500)) < 300:
                ok += 1
            else:
                failures.append(str(r.get("error"))[:200])
    if failures:
        raise RuntimeError(f"{len(failures)} bulk failures, first: {failures[0]}")
    return ok


def make_client(host: str, region: str):
    import boto3
    from opensearchpy import OpenSearch, RequestsHttpConnection
    from requests_aws4auth import AWS4Auth

    creds = boto3.Session().get_credentials()
    if creds is None:
        raise RuntimeError("No AWS credentials available for OpenSearch auth")
    frozen = creds.get_frozen_credentials()
    auth = AWS4Auth(
        frozen.access_key, frozen.secret_key, region, "aoss", session_token=frozen.token
    )
    return OpenSearch(
        hosts=[{"host": host, "port": 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=60,
    )


def index_components(
    *,
    host: str = "",
    region: str = "ap-northeast-2",
    index_name: str = DEFAULT_INDEX,
    output_dir: Path = OUTPUT_DIR,
    embed: bool = True,
    recreate: bool = True,
    workers: int = 8,
    client=None,
    embed_fn: Callable[[str], list[float]] | None = None,
) -> int:
    """Full load: (re)create the index, embed every component, bulk-index."""
    if embed and embed_fn is None:
        embed_fn = make_embedder(region=region)
    docs = build_documents(output_dir, embed=embed_fn if embed else None, workers=workers)
    if not docs:
        raise SystemExit(f"no components in {output_dir} — run `make data` first")
    client = client or make_client(host, region)
    if recreate:
        recreate_index(client, index_name, build_index_mapping())
    return bulk_index(client, index_name, docs)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default=os.environ.get("OPENSEARCH_HOST"))
    p.add_argument("--region", default=os.environ.get("AWS_REGION", "ap-northeast-2"))
    p.add_argument("--index", default=DEFAULT_INDEX)
    p.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    p.add_argument("--no-embed", action="store_true", help="BM25-only docs (skip Bedrock)")
    p.add_argument(
        "--keep-index",
        action="store_true",
        help="append without recreating the index (duplicates docs on re-run)",
    )
    p.add_argument("--workers", type=int, default=8)
    args = p.parse_args(argv)
    if not args.host:
        raise SystemExit("Set OPENSEARCH_HOST or pass --host")
    n = index_components(
        host=args.host,
        region=args.region,
        index_name=args.index,
        output_dir=args.output_dir,
        embed=not args.no_embed,
        recreate=not args.keep_index,
        workers=args.workers,
    )
    print(
        f"indexed {n} components into {args.index}"
        + ("" if args.no_embed else " (with embeddings)")
    )


if __name__ == "__main__":
    main()
