"""ontology/registry.py — the single source of truth for labels / rel types / TTL props."""

from __future__ import annotations

from pathlib import Path

import rdflib
from rdflib.collection import Collection
from rdflib.namespace import OWL, RDF, RDFS

from data.schemas import (
    CarbonScope,
    Certification,
    Component,
    CustomerAccount,
    EightDReport,
    ESGIndicator,
    MaintenanceEvent,
    Manufacturer,
    Module,
    Plant,
    Product,
    QualityIncident,
    RawMaterial,
    Region,
    Regulation,
    RootCause,
    Standard,
    Substance,
    SubSupplier,
    Supplier,
    Telemetry,
    TradeLane,
)
from ontology import build_ttl
from ontology import registry as reg

SCHEMA = Path(__file__).resolve().parents[2] / "ontology" / "schema.ttl"
MFG = rdflib.Namespace(reg.NAMESPACE)
MODELS = {
    m.__name__: m
    for m in (
        Product,
        Module,
        Component,
        RawMaterial,
        Manufacturer,
        Supplier,
        SubSupplier,
        CustomerAccount,
        Plant,
        Region,
        TradeLane,
        Standard,
        Certification,
        Regulation,
        Substance,
        QualityIncident,
        EightDReport,
        RootCause,
        Telemetry,
        MaintenanceEvent,
        ESGIndicator,
        CarbonScope,
    )
}


def test_registry_valid_and_covers_the_22_pydantic_classes():
    assert reg.validate() == []
    assert set(reg.labels()) == set(MODELS) and len(reg.labels()) == 22


def test_every_rule_field_exists_on_the_record_schema():
    for e in reg.EDGES:
        assert e.field in MODELS[e.record].model_fields, (e.rel, e.record, e.field)
        if e.kind == "join":
            assert e.join_field in MODELS[e.target].model_fields, (e.rel, e.target, e.join_field)
    for n in reg.NODES:
        assert n.id_field in MODELS[n.label].model_fields, n.label
        for f in n.serialized_lists:
            assert f in MODELS[n.label].model_fields, (n.label, f)


def test_rel_types_and_ttl_properties_are_one_to_one():
    pairs = {(e.rel, e.ttl) for e in reg.EDGES}
    assert len({r for r, _ in pairs}) == len({t for _, t in pairs}) == len(pairs)


def test_api_consumed_relationships_are_declared():
    """Cypher used by the routers (see tests/integration/test_graph_contract.py)."""
    assert ("Component", "Supplier") in {(e.src, e.dst) for e in reg.rules_for("SUPPLIED_BY")}
    assert ("Plant", "CarbonScope") in {(e.src, e.dst) for e in reg.rules_for("EMITS")}
    assert ("Telemetry", "Plant") in {(e.src, e.dst) for e in reg.rules_for("FROM")}
    assert ("TradeLane", "Regulation") in {(e.src, e.dst) for e in reg.rules_for("SUBJECT_TO")}


def test_schema_hint_lists_every_rel_type():
    hint = reg.schema_hint()
    assert all(f"[:{r}" in hint for r in reg.rel_types())
    assert "(Plant|Supplier|SubSupplier|CustomerAccount)-[:LOCATED_IN]->(Region)" in hint
    # Edge properties are rendered inside the relationship, Cypher-style.
    assert "-[:SUPPLIED_BY {leadtime, moq, otd, unit_price_usd}]->" in hint


# ───────────────────────────── generated TTL ────────────────────────────────


def test_schema_ttl_is_generated_from_registry():
    assert (
        SCHEMA.read_text(encoding="utf-8") == build_ttl.render_ttl()
    ), "ontology/schema.ttl is stale — run `python -m ontology.build_ttl`"
    assert build_ttl.main(["--check"]) == 0


def _members(g: rdflib.Graph, node) -> set[str]:
    if isinstance(node, rdflib.BNode):
        lst = g.value(node, OWL.unionOf)
        return {str(x).split("#")[-1] for x in Collection(g, lst)}
    return {str(node).split("#")[-1]}


def _graph() -> rdflib.Graph:
    g = rdflib.Graph()
    g.parse(SCHEMA, format="turtle")
    return g


def test_ttl_domain_range_equal_registry_union():
    g = _graph()
    for rel in reg.rel_types():
        prop = MFG[reg.ttl_property(rel)]
        assert (prop, RDF.type, OWL.ObjectProperty) in g, rel
        assert str(g.value(prop, MFG.cypherType)) == rel
        dom, rng = reg.endpoints(rel)
        assert _members(g, g.value(prop, RDFS.domain)) == set(dom), rel
        assert _members(g, g.value(prop, RDFS.range)) == set(rng), rel


def test_ttl_fixes_previous_domain_conflicts():
    g = _graph()
    located = _members(g, g.value(MFG.locatedIn, RDFS.domain))
    assert {"Plant", "Supplier", "SubSupplier", "CustomerAccount"} <= located
    assert "Plant" in _members(g, g.value(MFG.certifiedBy, RDFS.domain))


def test_ttl_declares_exactly_the_registry_classes_and_properties():
    g = _graph()
    named_classes = {
        str(s).split("#")[-1]
        for s in g.subjects(RDF.type, OWL.Class)
        if isinstance(s, rdflib.URIRef)
    }
    assert named_classes == set(reg.labels())
    props = {str(s).split("#")[-1] for s in g.subjects(RDF.type, OWL.ObjectProperty)}
    assert props == {reg.ttl_property(r) for r in reg.rel_types()}
