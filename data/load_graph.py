"""Load synthetic NDJSON files into Neptune via openCypher batch MERGE.

Idempotent: re-running this loader against an already-populated Neptune is a
no-op (MERGE matches existing nodes/edges by id). Runs as a one-shot ECS task
defined in `infra-cdk/lib/data-stack.ts`.

Required env:
  NEPTUNE_ENDPOINT  e.g. https://<cluster>.cluster-xxx.neptune.amazonaws.com:8182
  AWS_REGION        ap-northeast-2
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
from typing import Iterable
import requests

OUTPUT_DIR = Path(__file__).resolve().parent / "output"

# Map ndjson file -> Neptune label
NODE_FILES: list[tuple[str, str]] = [
    ("manufacturers.ndjson",  "Manufacturer"),
    ("products.ndjson",       "Product"),
    ("modules.ndjson",        "Module"),
    ("components.ndjson",     "Component"),
    ("raw_materials.ndjson",  "RawMaterial"),
    ("suppliers.ndjson",      "Supplier"),
    ("sub_suppliers.ndjson",  "SubSupplier"),
    ("customers.ndjson",      "CustomerAccount"),
    ("plants.ndjson",         "Plant"),
    ("lanes.ndjson",          "TradeLane"),
    ("incidents.ndjson",      "QualityIncident"),
    ("eight_d_reports.ndjson","EightDReport"),
    ("root_causes.ndjson",    "RootCause"),
    ("telemetry.ndjson",      "Telemetry"),
    ("maintenance.ndjson",    "MaintenanceEvent"),
    ("esg_indicators.ndjson", "ESGIndicator"),
    ("esg_carbon_scopes.ndjson", "CarbonScope"),
]


def build_create_node_cypher(label: str, props: dict) -> str:
    """Form an idempotent MERGE for one node. Param keys = props keys."""
    set_clauses = ", ".join(f"n.{k} = ${k}" for k in props if k != "id")
    return f"MERGE (n:{label} {{id: $id}}) SET {set_clauses}"


def build_create_edge_cypher(*, src_label: str, src_id: str, rel: str,
                              dst_label: str, dst_id: str, props: dict) -> str:
    set_clauses = ", ".join(f"r.{k} = ${k}" for k in props)
    set_part = f" SET {set_clauses}" if set_clauses else ""
    return (f"MATCH (a:{src_label} {{id: $src_id}}) "
            f"MATCH (b:{dst_label} {{id: $dst_id}}) "
            f"MERGE (a)-[r:{rel}]->(b){set_part}")


def _get_neptune_creds():
    """Return (frozen_credentials, region) for Neptune SigV4 signing."""
    import boto3
    region = os.environ.get("AWS_REGION", "ap-northeast-2")
    creds = boto3.Session().get_credentials()
    if creds is None:
        raise RuntimeError("No AWS credentials available for Neptune IAM auth")
    return creds.get_frozen_credentials(), region


def _signed_neptune_post(url: str, body: bytes, content_type: str) -> requests.Response:
    """POST to Neptune with botocore SigV4 signing."""
    import requests
    from botocore.auth import SigV4Auth
    from botocore.awsrequest import AWSRequest
    from botocore.credentials import Credentials

    frozen, region = _get_neptune_creds()
    aws_request = AWSRequest(
        method="POST",
        url=url,
        data=body,
        headers={"Content-Type": content_type},
    )
    SigV4Auth(
        Credentials(frozen.access_key, frozen.secret_key, frozen.token),
        "neptune-db",
        region,
    ).add_auth(aws_request)

    prepared = aws_request.prepare()
    return requests.post(
        url,
        data=body,
        headers=dict(prepared.headers),
        timeout=60,
        verify=True,
    )


def _post_cypher(endpoint: str, query: str, params: dict) -> dict:
    url = f"{endpoint.rstrip('/')}/openCypher"
    body = json.dumps({"query": query, "parameters": json.dumps(params)}).encode("utf-8")
    resp = _signed_neptune_post(url, body, "application/json")
    if resp.status_code >= 300:
        raise RuntimeError(f"openCypher failed [{resp.status_code}]: {resp.text}")
    return resp.json()


def _iter_ndjson(path: Path) -> Iterable[dict]:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            yield json.loads(line)


def load_all_nodes(endpoint: str) -> int:
    total = 0
    for fname, label in NODE_FILES:
        path = OUTPUT_DIR / fname
        for obj in _iter_ndjson(path):
            # Drop list-valued props that aren't supported by Neptune as node props
            scalar = {k: v for k, v in obj.items() if not isinstance(v, list)}
            scalar["id"] = obj["id"] if "id" in obj else obj.get("sensor_id") or obj.get("cas_id")
            if scalar.get("id") is None:
                continue
            q = build_create_node_cypher(label, scalar)
            _post_cypher(endpoint, q, scalar)
            total += 1
    return total


def load_bom_edges(endpoint: str) -> int:
    """Materialize HAS_MODULE / CONSISTS_OF / MADE_OF from ndjson."""
    n = 0
    # HAS_MODULE
    for mod in _iter_ndjson(OUTPUT_DIR / "modules.ndjson"):
        for pid in mod.get("parent_product_ids", []):
            q = build_create_edge_cypher(
                src_label="Product", src_id=pid,
                rel="HAS_MODULE",
                dst_label="Module", dst_id=mod["id"],
                props={},
            )
            _post_cypher(endpoint, q, {"src_id": pid, "dst_id": mod["id"]})
            n += 1
    # CONSISTS_OF — naive 8-component-per-module assignment in order
    components = list(_iter_ndjson(OUTPUT_DIR / "components.ndjson"))
    modules = list(_iter_ndjson(OUTPUT_DIR / "modules.ndjson"))
    for i, mod in enumerate(modules):
        for j in range(8):
            idx = (i * 8 + j) % len(components)
            comp = components[idx]
            q = build_create_edge_cypher(
                src_label="Module", src_id=mod["id"],
                rel="CONSISTS_OF",
                dst_label="Component", dst_id=comp["id"],
                props={"qty": 1},
            )
            _post_cypher(endpoint, q, {"src_id": mod["id"], "dst_id": comp["id"], "qty": 1})
            n += 1
    return n


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--endpoint", default=os.environ.get("NEPTUNE_ENDPOINT"))
    p.add_argument("--bom-edges", action="store_true")
    args = p.parse_args()
    if not args.endpoint:
        raise SystemExit("Set NEPTUNE_ENDPOINT or pass --endpoint")
    n_nodes = load_all_nodes(args.endpoint)
    print(f"loaded {n_nodes} nodes")
    if args.bom_edges:
        n_edges = load_bom_edges(args.endpoint)
        print(f"loaded {n_edges} BOM edges")


if __name__ == "__main__":
    main()
