"""Upload `ontology/schema.ttl` (OWL/RDF) to a Neptune cluster via SPARQL UPDATE.

Loader (`data/load.py`) calls this once at the start of bootstrap, then loads
property-graph data via openCypher. Schema is informative (used by SPARQL queries
and KB indexing); openCypher operations don't enforce it.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import requests


def upload_schema_to_neptune(*, endpoint: str, schema_path: str | Path) -> None:
    """POST a SPARQL UPDATE of `schema.ttl` contents to Neptune.

    Args:
        endpoint: Neptune cluster writer endpoint, e.g. https://<cluster>.cluster-xxx.neptune.amazonaws.com:8182
        schema_path: filesystem path to schema.ttl
    """
    ttl_text = Path(schema_path).read_text(encoding="utf-8")
    sparql = f"INSERT DATA {{ {_ttl_to_sparql_triples(ttl_text)} }}"
    url = f"{endpoint.rstrip('/')}/sparql"
    resp = requests.post(url, data={"update": sparql}, timeout=60)
    if resp.status_code >= 300:
        raise RuntimeError(f"SPARQL UPDATE failed [{resp.status_code}]: {resp.text}")


def _ttl_to_sparql_triples(ttl: str) -> str:
    """Naive Turtle->SPARQL conversion: strip prefixes and emit raw triples body.

    Production-grade: use rdflib to parse and serialize as N-Triples. For the
    demo we keep schema minimal (24 classes + 24 properties) so the Turtle
    body itself is valid as the body of an INSERT DATA when prefixes are pulled
    out. Loader passes prefixes via the SPARQL query header instead.
    """
    import rdflib
    g = rdflib.Graph()
    g.parse(data=ttl, format="turtle")
    return g.serialize(format="ntriples")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--endpoint", required=True)
    p.add_argument("--schema", default="ontology/schema.ttl")
    args = p.parse_args()
    upload_schema_to_neptune(endpoint=args.endpoint, schema_path=args.schema)
    print(f"schema uploaded → {args.endpoint}")


if __name__ == "__main__":
    main()
