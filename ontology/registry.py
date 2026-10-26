"""Knowledge-graph contract registry — the single source of truth.

Every Neptune label, relationship type and TTL object property of the mfg
ontology is declared here once:

* `NODES`  — one `NodeSpec` per class (22): label, group, where its records
  come from (`data/output/<stem>.ndjson` or `public:<key>` reference data),
  which field holds the application id, and which list fields the API reads
  *directly as node properties* (kept as a comma-joined scalar because Neptune
  openCypher has no list-valued properties).
* `EDGES`  — one `EdgeSpec` per derivation rule: Cypher relationship type
  (UPPER_SNAKE), TTL object property (camelCase), source → target label, and
  how the edge is derived from source records (FK field, FK list, list of
  offer objects, or a join on equal field values).

Consumers:
* `data/load_graph.py`   — builds node / edge batches from these specs
* `ontology/build_ttl.py` — renders `ontology/schema.ttl` (domains / ranges are
  the union of all rules sharing a relationship type)
* `tests/integration/test_graph_contract.py` — asserts every label /
  relationship type / property the API's Cypher reads is produced here

Pure Python, no third-party imports (shipped in both the API and loader images).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

NAMESPACE = "https://amzn.tech/mfg/ontology#"
SCHEMA_GRAPH = "https://amzn.tech/mfg/ontology"  # named graph for the TTL upload
LIST_SEPARATOR = ","  # Neptune-recommended encoding for list values (split(prop, ','))

EdgeKind = Literal["fk", "fk_list", "objects", "join"]


@dataclass(frozen=True)
class NodeSpec:
    label: str
    group: str
    source: str  # ndjson stem under data/output, or "public:<key>"
    id_field: str = "id"  # record field holding the application id
    serialized_lists: tuple[str, ...] = ()  # list fields the API reads as node props
    comment: str = ""

    @property
    def is_reference(self) -> bool:
        return self.source.startswith("public:")

    @property
    def reference_key(self) -> str:
        return self.source.split(":", 1)[1]


@dataclass(frozen=True)
class EdgeSpec:
    """One derivation rule `(src)-[:rel]->(dst)`.

    `record` is the label whose records carry `field`:
      * record == src → the field points at dst (forward FK)
      * record == dst → the field points at src (reverse FK, e.g. Module.parent_product_ids
        materialises Product-[:HAS_MODULE]->Module)
    kinds:
      fk       field holds one target id (None → no edge)
      fk_list  field holds a list of target ids
      objects  field holds a list of dicts; `key` names the target id, the other
               keys become edge properties
      join     no FK — connect record to every node of the other label whose
               `join_field` equals the record's `field`
    Several rules may share one `rel` (polymorphic domain / range); they must
    then share the same `ttl` property. A polymorphic FK (one field pointing at
    different labels, e.g. MaintenanceEvent.target_id) is expressed as several
    rules on the same field — each id must resolve under exactly one of them.
    """

    rel: str
    ttl: str
    src: str
    dst: str
    record: str
    field: str
    kind: EdgeKind = "fk"
    key: str = ""
    join_field: str = ""
    props: tuple[tuple[str, Any], ...] = ()  # constant edge properties
    # `objects` rules copy each object's other keys onto the edge — name them here so
    # the chat schema hint can say where values live (contract-tested against the loader).
    data_props: tuple[str, ...] = ()
    comment: str = ""

    @property
    def target(self) -> str:
        """Label that `field` (or join_field) refers to."""
        return self.dst if self.record == self.src else self.src

    @property
    def reverse(self) -> bool:
        return self.record != self.src


GROUPS: dict[str, str] = {
    "BOM": "BOM 계층",
    "Supply": "Supply 양면",
    "Geo": "Geo / 운송",
    "Compliance": "표준 / 규제",
    "Quality": "품질",
    "Ops": "운영 / ESG",
}

NODES: tuple[NodeSpec, ...] = (
    # BOM 계층 (4)
    NodeSpec("Product", "BOM", "products"),
    NodeSpec("Module", "BOM", "modules"),
    NodeSpec(
        "Component",
        "BOM",
        "components",
        serialized_lists=("standards", "substances"),
        comment="standards / substances are also kept as comma-joined props "
        "(read by /compliance and /substitute)",
    ),
    NodeSpec("RawMaterial", "BOM", "raw_materials"),
    # Supply 양면 (5)
    NodeSpec("Manufacturer", "Supply", "manufacturers"),
    NodeSpec("Supplier", "Supply", "suppliers"),
    NodeSpec("SubSupplier", "Supply", "sub_suppliers"),
    NodeSpec("CustomerAccount", "Supply", "customers"),
    NodeSpec("Plant", "Supply", "plants"),
    # Geo / 운송 (2)
    NodeSpec("Region", "Geo", "public:regions"),
    NodeSpec(
        "TradeLane",
        "Geo",
        "lanes",
        serialized_lists=("regulations",),
        comment="regulations also kept as a comma-joined prop (read by /lane)",
    ),
    # 표준 / 규제 (4)
    NodeSpec("Standard", "Compliance", "public:standards"),
    NodeSpec("Certification", "Compliance", "certifications"),
    NodeSpec("Regulation", "Compliance", "public:regulations"),
    NodeSpec("Substance", "Compliance", "public:substances", id_field="cas_id"),
    # 품질 (3)
    NodeSpec("QualityIncident", "Quality", "incidents"),
    NodeSpec("EightDReport", "Quality", "eight_d_reports"),
    NodeSpec("RootCause", "Quality", "root_causes"),
    # 운영 / ESG (4)
    NodeSpec("Telemetry", "Ops", "telemetry", id_field="sensor_id"),
    NodeSpec("MaintenanceEvent", "Ops", "maintenance"),
    NodeSpec("ESGIndicator", "Ops", "esg_indicators"),
    NodeSpec(
        "CarbonScope",
        "Ops",
        "esg_carbon_scopes",
        comment="id = CS-<plant_id>-S<scope>-<period> (data.schemas.carbon_scope_id)",
    ),
)

E = EdgeSpec
EDGES: tuple[EdgeSpec, ...] = (
    # ── BOM ────────────────────────────────────────────────────────────────
    E("HAS_MODULE", "hasModule", "Product", "Module", "Module", "parent_product_ids", "fk_list"),
    E(
        "CONSISTS_OF",
        "consistsOf",
        "Module",
        "Component",
        "Component",
        "module_ids",
        "fk_list",
        props=(("qty", 1),),
    ),
    E("MADE_OF", "madeOf", "Component", "RawMaterial", "Component", "raw_material_ids", "fk_list"),
    # ── Supply ─────────────────────────────────────────────────────────────
    E("MANUFACTURED_BY", "manufacturedBy", "Product", "Manufacturer", "Product", "manufacturer_id"),
    E("OPERATES", "operates", "Manufacturer", "Plant", "Plant", "manufacturer_id"),
    E("LOCATED_IN", "locatedIn", "Plant", "Region", "Plant", "region"),
    E("LOCATED_IN", "locatedIn", "Supplier", "Region", "Supplier", "region"),
    E("LOCATED_IN", "locatedIn", "SubSupplier", "Region", "SubSupplier", "region"),
    E("LOCATED_IN", "locatedIn", "CustomerAccount", "Region", "CustomerAccount", "region"),
    E(
        "SUPPLIED_BY",
        "suppliedBy",
        "Component",
        "Supplier",
        "Component",
        "supply",
        "objects",
        key="supplier_id",
        data_props=("leadtime", "otd", "unit_price_usd", "moq"),
        comment="price / lead time live on the edge (read by /price)",
    ),
    E(
        "SUB_SUPPLIES",
        "subSupplies",
        "Supplier",
        "SubSupplier",
        "SubSupplier",
        "parent_supplier_id",
        comment="Tier-1 supplier → its Tier-2 sub-supplier",
    ),
    E("SOLD_TO", "soldTo", "Product", "CustomerAccount", "Product", "customer_ids", "fk_list"),
    # ── Geo / Lane ─────────────────────────────────────────────────────────
    E(
        "CONNECTS",
        "connects",
        "TradeLane",
        "Region",
        "TradeLane",
        "origin_region",
        props=(("end", "origin"),),
    ),
    E(
        "CONNECTS",
        "connects",
        "TradeLane",
        "Region",
        "TradeLane",
        "dest_region",
        props=(("end", "dest"),),
    ),
    E(
        "SHIPS_VIA",
        "shipsVia",
        "Plant",
        "TradeLane",
        "Plant",
        "region",
        "join",
        join_field="origin_region",
        comment="plant ships on every lane leaving its region",
    ),
    E("SUBJECT_TO", "subjectTo", "TradeLane", "Regulation", "TradeLane", "regulations", "fk_list"),
    # ── Compliance ─────────────────────────────────────────────────────────
    E("CONFORMS_TO", "conformsTo", "Component", "Standard", "Component", "standards", "fk_list"),
    E(
        "CONTAINS_SUBSTANCE",
        "containsSubstance",
        "Component",
        "Substance",
        "Component",
        "substances",
        "fk_list",
    ),
    E(
        "REGULATED_BY",
        "regulatedBy",
        "Substance",
        "Regulation",
        "Substance",
        "regulation_ids",
        "fk_list",
    ),
    E("CERTIFIED_BY", "certifiedBy", "Plant", "Certification", "Certification", "target_id"),
    E("CERTIFIED_BY", "certifiedBy", "Component", "Certification", "Certification", "target_id"),
    E("FOR_STANDARD", "forStandard", "Certification", "Standard", "Certification", "standard_id"),
    # ── Quality ────────────────────────────────────────────────────────────
    E("ABOUT", "about", "QualityIncident", "Component", "QualityIncident", "component_id"),
    E("AT_PLANT", "atPlant", "QualityIncident", "Plant", "QualityIncident", "plant_id"),
    E("AT_PLANT", "atPlant", "MaintenanceEvent", "Plant", "MaintenanceEvent", "target_id"),
    E("ADDRESSES", "addresses", "EightDReport", "QualityIncident", "EightDReport", "incident_id"),
    E(
        "IDENTIFIES",
        "identifies",
        "EightDReport",
        "RootCause",
        "EightDReport",
        "incident_id",
        "join",
        join_field="incident_id",
        comment="8D and RootCause of the same incident",
    ),
    E("LINKED_TO", "linkedTo", "RootCause", "Supplier", "RootCause", "linked_supplier_id"),
    E("LINKED_TO", "linkedTo", "RootCause", "Component", "RootCause", "linked_component_id"),
    E("LINKED_TO", "linkedTo", "RootCause", "Plant", "RootCause", "linked_plant_id"),
    # ── Ops / ESG ──────────────────────────────────────────────────────────
    E(
        "FROM",
        "from",
        "Telemetry",
        "Plant",
        "Telemetry",
        "plant_id",
        comment="read by /pdm (plant filter)",
    ),
    E("MONITORS", "monitors", "Telemetry", "Component", "Telemetry", "component_id"),
    E(
        "PERFORMED_ON",
        "performedOn",
        "MaintenanceEvent",
        "Component",
        "MaintenanceEvent",
        "target_id",
    ),
    E("MEASURED_AT", "measuredAt", "ESGIndicator", "Plant", "ESGIndicator", "plant_id"),
    E(
        "EMITS",
        "emits",
        "Plant",
        "CarbonScope",
        "CarbonScope",
        "plant_id",
        comment="read by /esg and /insights",
    ),
)
del E

_UPPER_SNAKE = re.compile(r"^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$")
_CAMEL = re.compile(r"^[a-z][A-Za-z0-9]*$")


# ── lookups ────────────────────────────────────────────────────────────────
def labels() -> list[str]:
    return [n.label for n in NODES]


def node_spec(label: str) -> NodeSpec:
    for n in NODES:
        if n.label == label:
            return n
    raise KeyError(label)


def rel_types() -> list[str]:
    seen: dict[str, None] = {}
    for e in EDGES:
        seen.setdefault(e.rel, None)
    return list(seen)


def rules_for(rel: str) -> list[EdgeSpec]:
    return [e for e in EDGES if e.rel == rel]


def ttl_property(rel: str) -> str:
    return rules_for(rel)[0].ttl


def endpoints(rel: str) -> tuple[list[str], list[str]]:
    """(domain labels, range labels) — union over every rule of `rel`, in declaration order."""
    dom: dict[str, None] = {}
    rng: dict[str, None] = {}
    for e in rules_for(rel):
        dom.setdefault(e.src, None)
        rng.setdefault(e.dst, None)
    return list(dom), list(rng)


def constant_edge_props(rel: str) -> set[str]:
    """Constant edge prop names declared for `rel` (`objects` rules add data-driven props)."""
    return {k for e in rules_for(rel) for k, _ in e.props}


def edge_props(rel: str) -> list[str]:
    """Every property the loader writes on `rel` edges (constant + object-derived)."""
    return sorted(constant_edge_props(rel) | {p for e in rules_for(rel) for p in e.data_props})


def schema_hint() -> str:
    """Compact `(Src)-[:REL {props}]->(Dst)` listing — e.g. for an LLM system prompt."""
    lines = []
    for rel in rel_types():
        dom, rng = endpoints(rel)
        props = edge_props(rel)
        rel_part = f"{rel} {{{', '.join(props)}}}" if props else rel
        lines.append(f"({'|'.join(dom)})-[:{rel_part}]->({'|'.join(rng)})")
    return "\n".join(lines)


def validate() -> list[str]:
    """Return a list of registry inconsistencies (empty == valid)."""
    errors: list[str] = []
    known = set(labels())
    if len(known) != len(NODES):
        errors.append("duplicate NodeSpec labels")
    rel_to_ttl: dict[str, str] = {}
    ttl_to_rel: dict[str, str] = {}
    seen_rules: set[tuple[str, str, str, str]] = set()
    for e in EDGES:
        where = f"{e.rel}({e.src}->{e.dst} via {e.record}.{e.field})"
        if not _UPPER_SNAKE.match(e.rel):
            errors.append(f"{where}: rel type must be UPPER_SNAKE")
        if not _CAMEL.match(e.ttl):
            errors.append(f"{where}: ttl property must be camelCase")
        for lbl in (e.src, e.dst):
            if lbl not in known:
                errors.append(f"{where}: unknown label {lbl}")
        if e.record not in (e.src, e.dst):
            errors.append(f"{where}: record label must be src or dst")
        if e.kind == "objects" and not e.key:
            errors.append(f"{where}: objects rule needs `key`")
        if e.kind == "join" and not e.join_field:
            errors.append(f"{where}: join rule needs `join_field`")
        if rel_to_ttl.setdefault(e.rel, e.ttl) != e.ttl:
            errors.append(f"{where}: rel mapped to two TTL properties")
        if ttl_to_rel.setdefault(e.ttl, e.rel) != e.rel:
            errors.append(f"{where}: TTL property mapped to two rel types")
        k = (e.rel, e.src, e.dst, e.field)
        if k in seen_rules:
            errors.append(f"{where}: duplicate rule")
        seen_rules.add(k)
    return errors


__all__ = [
    "EDGES",
    "GROUPS",
    "LIST_SEPARATOR",
    "NAMESPACE",
    "NODES",
    "SCHEMA_GRAPH",
    "EdgeSpec",
    "NodeSpec",
    "endpoints",
    "labels",
    "node_spec",
    "rel_types",
    "rules_for",
    "schema_hint",
    "ttl_property",
    "validate",
]
