"""Load the synthetic dataset + public reference data into Neptune (openCypher).

Everything the loader writes is derived from `ontology/registry.py`:
labels / id fields / source files from `NODES`, relationship types and their
derivation from `EDGES`. The module is split in two layers:

* **build** (pure, no AWS) — `load_records()` → `build_graph()` returns
  `GraphBatches` (node rows per label, edge rows per (rel, src, dst), plus any
  dangling FK references). Unit-tested on the generator output.
* **send** — `iter_statements()` turns batches into `UNWIND $rows ... MERGE`
  statements; `load()` posts them to Neptune with SigV4.

Neptune openCypher has no list-valued properties: list fields become edges.
The few list fields the API reads directly as node properties
(`NodeSpec.serialized_lists`) are additionally stored comma-joined
(`registry.LIST_SEPARATOR`); every other list / object field is dropped from
the node and only exists as edges.

Idempotent: MERGE on `id` for nodes and on (a, type, b) for edges. `--reset`
first deletes every node of the registry labels (DETACH) so edges from older
loader versions don't linger. Runs as a one-shot ECS task (`loader/run.sh`).

Required env:
  NEPTUNE_ENDPOINT  e.g. https://<cluster>.cluster-xxx.neptune.amazonaws.com:8182
  AWS_REGION        ap-northeast-2

Offline inspection (no AWS):
  python -m data.load_graph --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter, defaultdict
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ontology import registry as reg

OUTPUT_DIR = Path(__file__).resolve().parent / "output"
DEFAULT_BATCH_SIZE = 100
RESET_BATCH_SIZE = 2000
RESET_MAX_ROUNDS = 500

EdgeKey = tuple[str, str, str]  # (rel, src_label, dst_label)

# Back-compat view of the registry: ndjson file -> label (synthetic sources only)
NODE_FILES: list[tuple[str, str]] = [
    (f"{n.source}.ndjson", n.label) for n in reg.NODES if not n.is_reference
]


# ═══════════════════════════════ build (pure) ═══════════════════════════════


@dataclass
class Dangling:
    rel: str
    record_label: str
    record_id: str
    field: str
    value: str


@dataclass
class GraphBatches:
    nodes: dict[str, list[dict]] = field(default_factory=dict)  # label -> rows
    edges: dict[EdgeKey, list[dict]] = field(default_factory=dict)  # key -> [{src,dst,props}]
    dangling: list[Dangling] = field(default_factory=list)

    def node_counts(self) -> dict[str, int]:
        return {lbl: len(rows) for lbl, rows in self.nodes.items()}

    def edge_counts(self) -> dict[str, int]:
        c: Counter = Counter()
        for (rel, _s, _d), rows in self.edges.items():
            c[rel] += len(rows)
        return dict(c)


def _iter_ndjson(path: Path) -> Iterable[dict]:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            yield json.loads(line)


def load_records(output_dir: Path = OUTPUT_DIR) -> dict[str, list[dict]]:
    """label -> raw records (synthetic ndjson + public reference data)."""
    from data.reference import load_reference

    out: dict[str, list[dict]] = {}
    for spec in reg.NODES:
        if spec.is_reference:
            out[spec.label] = load_reference(spec.reference_key)
        else:
            out[spec.label] = list(_iter_ndjson(Path(output_dir) / f"{spec.source}.ndjson"))
    return out


def record_id(spec: reg.NodeSpec, rec: dict) -> str | None:
    """Application id of a record. CarbonScope rows written before ids existed
    get the same deterministic id the schema assigns."""
    rid = rec.get(spec.id_field) or rec.get("id")
    if not rid and spec.label == "CarbonScope":
        from data.schemas import carbon_scope_id

        if rec.get("plant_id") and rec.get("scope") is not None and rec.get("period"):
            rid = carbon_scope_id(rec["plant_id"], rec["scope"], rec["period"])
    return str(rid) if rid else None


def _is_scalar(v: Any) -> bool:
    return isinstance(v, str | int | float | bool)


def node_properties(spec: reg.NodeSpec, rec: dict) -> dict | None:
    """Neptune-safe property map: scalars only, None dropped, `id` set,
    serialized list fields comma-joined, every other list / dict dropped."""
    rid = record_id(spec, rec)
    if rid is None:
        return None
    props: dict[str, Any] = {}
    for k, v in rec.items():
        if v is None:
            continue
        if k in spec.serialized_lists:
            items = v if isinstance(v, list) else [v]
            props[k] = reg.LIST_SEPARATOR.join(str(x) for x in items)
        elif _is_scalar(v):
            props[k] = v
    for k in spec.serialized_lists:  # always present → re-runs overwrite
        props.setdefault(k, "")
    props["id"] = rid
    return props


def build_nodes(records: dict[str, list[dict]]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for spec in reg.NODES:
        rows: dict[str, dict] = {}
        for rec in records.get(spec.label, []):
            props = node_properties(spec, rec)
            if props is not None:
                rows.setdefault(props["id"], props)
        out[spec.label] = list(rows.values())
    return out


def _targets(rule: reg.EdgeSpec, rec: dict) -> list[tuple[str, dict]]:
    """(target id, edge props) pairs a record contributes under `rule` (non-join kinds)."""
    v = rec.get(rule.field)
    const = dict(rule.props)
    if v is None or v == "" or v == []:
        return []
    if rule.kind == "fk":
        return [(str(v), const)]
    if rule.kind == "fk_list":
        items = v if isinstance(v, list) else str(v).split(reg.LIST_SEPARATOR)
        return [(str(x), const) for x in items if x not in (None, "")]
    if rule.kind == "objects":
        pairs = []
        for obj in v:
            tid = obj.get(rule.key)
            if tid:
                props = {k: x for k, x in obj.items() if k != rule.key and _is_scalar(x)}
                pairs.append((str(tid), {**props, **const}))
        return pairs
    raise ValueError(f"unsupported kind {rule.kind}")


def build_edges(
    records: dict[str, list[dict]], nodes: dict[str, list[dict]]
) -> tuple[dict[EdgeKey, list[dict]], list[Dangling]]:
    ids_by_label = {lbl: {r["id"] for r in rows} for lbl, rows in nodes.items()}
    specs = {n.label: n for n in reg.NODES}
    edges: dict[EdgeKey, dict[tuple[str, str], dict]] = defaultdict(dict)

    def add(rule: reg.EdgeSpec, rec_id: str, other_id: str, props: dict) -> None:
        src, dst = (other_id, rec_id) if rule.reverse else (rec_id, other_id)
        edges[(rule.rel, rule.src, rule.dst)].setdefault(
            (src, dst), {"src": src, "dst": dst, "props": props}
        )

    # FK-style rules, grouped by (record label, field) so a polymorphic field
    # (several rules, different target labels) is resolved once per value.
    by_field: dict[tuple[str, str], list[reg.EdgeSpec]] = defaultdict(list)
    for rule in reg.EDGES:
        if rule.kind != "join":
            by_field[(rule.record, rule.field)].append(rule)

    dangling: list[Dangling] = []
    for (rec_label, fld), rules in by_field.items():
        spec = specs[rec_label]
        for rec in records.get(rec_label, []):
            rid = record_id(spec, rec)
            if rid is None:
                continue
            for rule in rules:
                for tid, props in _targets(rule, rec):
                    if tid in ids_by_label.get(rule.target, ()):
                        add(rule, rid, tid, props)
            # dangling = values that resolved under none of the rules on this field
            for tid, _ in _targets(rules[0], rec):
                if not any(tid in ids_by_label.get(r.target, ()) for r in rules):
                    dangling.append(
                        Dangling("/".join(sorted({r.rel for r in rules})), rec_label, rid, fld, tid)
                    )

    # join rules
    for rule in reg.EDGES:
        if rule.kind != "join":
            continue
        index: dict[Any, list[str]] = defaultdict(list)
        tspec = specs[rule.target]
        for trec in records.get(rule.target, []):
            jid = record_id(tspec, trec)
            if jid is not None and trec.get(rule.join_field) not in (None, ""):
                index[trec[rule.join_field]].append(jid)
        rspec = specs[rule.record]
        for rec in records.get(rule.record, []):
            rid = record_id(rspec, rec)
            if rid is None:
                continue
            for jid in index.get(rec.get(rule.field), []):
                add(rule, rid, jid, dict(rule.props))

    return {k: list(v.values()) for k, v in edges.items()}, dangling


def build_graph(
    output_dir: Path = OUTPUT_DIR, records: dict[str, list[dict]] | None = None
) -> GraphBatches:
    records = load_records(output_dir) if records is None else records
    nodes = build_nodes(records)
    edges, dangling = build_edges(records, nodes)
    return GraphBatches(nodes=nodes, edges=edges, dangling=dangling)


# ═════════════════════════════ cypher statements ════════════════════════════


def _q(name: str) -> str:
    """Backtick-quote a label / relationship type (FROM, ON … are keywords)."""
    return "`" + name.replace("`", "``") + "`"


def node_batch_cypher(label: str) -> str:
    return f"UNWIND $rows AS row MERGE (n:{_q(label)} {{id: row.id}}) SET n += row"


def edge_batch_cypher(rel: str, src_label: str, dst_label: str) -> str:
    return (
        f"UNWIND $rows AS row "
        f"MATCH (a:{_q(src_label)} {{id: row.src}}) "
        f"MATCH (b:{_q(dst_label)} {{id: row.dst}}) "
        f"MERGE (a)-[r:{_q(rel)}]->(b) SET r += row.props"
    )


def reset_cypher(label: str, limit: int = RESET_BATCH_SIZE) -> str:
    return f"MATCH (n:{_q(label)}) WITH n LIMIT {int(limit)} DETACH DELETE n"


def count_cypher(label: str) -> str:
    return f"MATCH (n:{_q(label)}) RETURN count(n) AS c"


def _chunks(rows: list[dict], size: int) -> Iterator[list[dict]]:
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


def iter_statements(
    graph: GraphBatches, *, batch_size: int = DEFAULT_BATCH_SIZE, include_edges: bool = True
) -> Iterator[tuple[str, dict]]:
    """All nodes first (edges MATCH their endpoints), then edges."""
    for label, rows in graph.nodes.items():
        q = node_batch_cypher(label)
        for chunk in _chunks(rows, batch_size):
            yield q, {"rows": chunk}
    if include_edges:
        for (rel, src, dst), rows in graph.edges.items():
            q = edge_batch_cypher(rel, src, dst)
            for chunk in _chunks(rows, batch_size):
                yield q, {"rows": chunk}


# ═══════════════════════════════ old helpers ════════════════════════════════
# Kept for callers / tests of the single-record API.


def build_create_node_cypher(label: str, props: dict) -> str:
    """Form an idempotent MERGE for one node. Param keys = props keys."""
    set_clauses = ", ".join(f"n.{k} = ${k}" for k in props if k != "id")
    return f"MERGE (n:{label} {{id: $id}}) SET {set_clauses}"


def build_create_edge_cypher(
    *, src_label: str, src_id: str, rel: str, dst_label: str, dst_id: str, props: dict
) -> str:
    set_clauses = ", ".join(f"r.{k} = ${k}" for k in props)
    set_part = f" SET {set_clauses}" if set_clauses else ""
    return (
        f"MATCH (a:{src_label} {{id: $src_id}}) "
        f"MATCH (b:{dst_label} {{id: $dst_id}}) "
        f"MERGE (a)-[r:{rel}]->(b){set_part}"
    )


# ═══════════════════════════════ send (network) ═════════════════════════════


def _get_neptune_creds():
    """Return (frozen_credentials, region) for Neptune SigV4 signing."""
    import boto3

    region = os.environ.get("AWS_REGION", "ap-northeast-2")
    creds = boto3.Session().get_credentials()
    if creds is None:
        raise RuntimeError("No AWS credentials available for Neptune IAM auth")
    return creds.get_frozen_credentials(), region


def _signed_neptune_post(url: str, body: bytes, content_type: str):
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


def reset_graph(endpoint: str, labels: Iterable[str] | None = None) -> dict[str, int]:
    """DETACH DELETE every node of the registry labels, in batches."""
    rounds: dict[str, int] = {}
    for label in labels or reg.labels():
        n = 0
        while n < RESET_MAX_ROUNDS:
            res = _post_cypher(endpoint, count_cypher(label), {})
            rows = res.get("results") or [{}]
            if int(rows[0].get("c", 0) or 0) == 0:
                break
            _post_cypher(endpoint, reset_cypher(label), {})
            n += 1
        rounds[label] = n
    return rounds


def load(
    endpoint: str,
    graph: GraphBatches,
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
    include_edges: bool = True,
) -> int:
    n = 0
    for q, params in iter_statements(graph, batch_size=batch_size, include_edges=include_edges):
        _post_cypher(endpoint, q, params)
        n += 1
    return n


def _print_summary(graph: GraphBatches) -> None:
    nc, ec = graph.node_counts(), graph.edge_counts()
    print(f"nodes: {sum(nc.values())} across {sum(1 for v in nc.values() if v)} labels")
    for lbl, c in nc.items():
        print(f"  {lbl:<18} {c:>6}")
    print(f"edges: {sum(ec.values())} across {len(ec)} relationship types")
    for rel, c in ec.items():
        print(f"  {rel:<18} {c:>6}")
    if graph.dangling:
        print(f"dangling FK references: {len(graph.dangling)} (first 10)")
        for d in graph.dangling[:10]:
            print(f"  {d.record_label}[{d.record_id}].{d.field} = {d.value!r} ({d.rel})")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--endpoint", default=os.environ.get("NEPTUNE_ENDPOINT"))
    p.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    p.add_argument("--dry-run", action="store_true", help="build + print counts, no Neptune calls")
    p.add_argument(
        "--reset",
        action="store_true",
        help="DETACH DELETE all registry-label nodes before loading (full reload)",
    )
    p.add_argument("--nodes-only", action="store_true", help="skip edges")
    p.add_argument(
        "--bom-edges",
        action="store_true",
        help="deprecated no-op: every registry edge is loaded by default",
    )
    p.add_argument(
        "--allow-dangling",
        action="store_true",
        help="load even if some FK values don't resolve to a node",
    )
    p.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    args = p.parse_args(argv)

    errors = reg.validate()
    if errors:
        raise SystemExit("registry invalid: " + "; ".join(errors))
    graph = build_graph(args.output_dir)
    _print_summary(graph)
    empty = [lbl for lbl, c in graph.node_counts().items() if c == 0]
    if empty:
        print(f"[warn] labels without records: {empty} — run `make data` first?")
    if graph.dangling and not args.allow_dangling:
        raise SystemExit(
            f"{len(graph.dangling)} dangling FK references — fix the data "
            "or pass --allow-dangling"
        )
    if args.dry_run:
        return
    if not args.endpoint:
        raise SystemExit("Set NEPTUNE_ENDPOINT or pass --endpoint")
    if args.reset:
        rounds = reset_graph(args.endpoint)
        print(f"reset: {sum(rounds.values())} delete batches")
    n = load(args.endpoint, graph, batch_size=args.batch_size, include_edges=not args.nodes_only)
    print(
        f"loaded {sum(graph.node_counts().values())} nodes"
        + ("" if args.nodes_only else f" + {sum(graph.edge_counts().values())} edges")
        + f" in {n} requests"
    )


if __name__ == "__main__":
    main()
