# tests/api/routers/test_objects.py
"""Coverage for the most security-critical router (label allowlist gate)
plus the Neptune wire-format normalizer (`_flatten_node`) and the
list-shaping (`_to_list_item`) helpers. Pre-evaluation this router had
0% test coverage despite holding the primary input-injection defense
for the object explorer."""

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from api.main import app
from api.routers.objects import (
    _ALLOWED_LABELS,
    _flatten_node,
    _to_list_item,
    _validate_label,
)


client = TestClient(app)


# ─── _ALLOWED_LABELS frozenset ─────────────────────────────────────────────


def test_allowlist_has_22_classes():
    """Spec § 8.1 declares 22 ontology classes; ADR-008 locks the count."""
    assert len(_ALLOWED_LABELS) == 22


def test_allowlist_is_frozenset():
    """O(1) lookup + immutability — both matter for the security gate."""
    assert isinstance(_ALLOWED_LABELS, frozenset)


@pytest.mark.parametrize(
    "expected_class",
    [
        "Product", "Module", "Component", "RawMaterial",
        "Manufacturer", "Supplier", "SubSupplier", "CustomerAccount", "Plant",
        "Region", "TradeLane",
        "Standard", "Certification", "Regulation", "Substance",
        "QualityIncident", "EightDReport", "RootCause",
        "Telemetry", "MaintenanceEvent", "ESGIndicator", "CarbonScope",
    ],
)
def test_each_canonical_class_in_allowlist(expected_class):
    assert expected_class in _ALLOWED_LABELS


# ─── _validate_label (the security gate) ───────────────────────────────────


def test_validate_label_accepts_canonical_label():
    assert _validate_label("Component") == "Component"
    assert _validate_label("QualityIncident") == "QualityIncident"


def test_validate_label_rejects_unknown_label():
    with pytest.raises(HTTPException) as exc:
        _validate_label("Unknown")
    assert exc.value.status_code == 400
    assert "Unknown" in str(exc.value.detail)
    assert "Allowed" in str(exc.value.detail)


def test_validate_label_rejects_cypher_injection_attempt():
    """Cypher does not parameterize labels; the allowlist is the only guard
    against `MATCH (n:`...`) DETACH DELETE n` style label-position injection."""
    with pytest.raises(HTTPException) as exc:
        _validate_label("Component) DETACH DELETE n MATCH (m:X")
    assert exc.value.status_code == 400


def test_validate_label_rejects_lowercase():
    """Allowlist is case-sensitive — `component` (lower) must not pass."""
    with pytest.raises(HTTPException):
        _validate_label("component")


def test_validate_label_rejects_empty():
    with pytest.raises(HTTPException):
        _validate_label("")


# ─── _flatten_node (Neptune wire-format normalizer) ────────────────────────


def test_flatten_node_shape_a_with_id_property():
    """Shape A: ~id + ~labels + ~properties with own id property."""
    raw = {
        "~id": "internal-1",
        "~labels": ["Component"],
        "~properties": {"id": "AMZN-CMP-IC-00001", "name": "Test IC"},
    }
    out = _flatten_node(raw)
    assert out["id"] == "AMZN-CMP-IC-00001"
    assert out["name"] == "Test IC"


def test_flatten_node_shape_b_falls_back_to_internal_id():
    """Shape B: missing application-level id property — must use ~id."""
    raw = {
        "~id": "internal-2",
        "~labels": ["Supplier"],
        "~properties": {"name": "Acme Corp"},
    }
    out = _flatten_node(raw)
    assert out["id"] == "internal-2"
    assert out["name"] == "Acme Corp"


def test_flatten_node_shape_c_already_flat():
    """Shape C: result already flat from `RETURN n.id, n.name` projection."""
    raw = {"id": "AMZN-PLANT-005", "name": "Plant KR-1", "region": "KR"}
    out = _flatten_node(raw)
    assert out == raw


def test_flatten_node_synthesizes_name_when_missing():
    """If neither name nor cas_id present, fall back to the resolved id."""
    raw = {"~id": "x", "~properties": {"id": "AMZN-X-1"}}
    out = _flatten_node(raw)
    assert out["name"] == "AMZN-X-1"


def test_flatten_node_handles_non_dict():
    """Defensive: stringify scalars rather than raise."""
    out = _flatten_node("just-a-string")  # type: ignore[arg-type]
    assert out["id"] == "just-a-string"


# ─── _to_list_item (rank score per label) ─────────────────────────────────


def test_to_list_item_supplier_ranks_by_rfm_recency():
    flat = {"id": "S1", "name": "Acme", "rfm_recency": 0.85}
    item = _to_list_item(flat, "Supplier")
    assert item["id"] == "S1"
    assert item["name"] == "Acme"
    assert item["rank_score"] == 85  # round(0.85 * 100)


def test_to_list_item_quality_incident_ranks_by_severity():
    flat = {"id": "INC-1", "name": "Crack", "severity": "CRITICAL"}
    item = _to_list_item(flat, "QualityIncident")
    assert item["rank_score"] == 4  # CRITICAL → 4


def test_to_list_item_plant_self_ranks_higher_than_supplier_operated():
    self_op = _to_list_item({"id": "P1", "name": "P", "operator": "SELF"}, "Plant")
    sup_op = _to_list_item({"id": "P2", "name": "P", "operator": "SUPPLIER"}, "Plant")
    assert self_op["rank_score"] > sup_op["rank_score"]


def test_to_list_item_substance_uses_cas_id_fallback():
    """Substance records key on cas_id rather than id."""
    flat = {"cas_id": "117-81-7", "name": "DEHP", "cmr_grade": "1B"}
    item = _to_list_item(flat, "Substance")
    assert item["id"] == "117-81-7"


# ─── /objects endpoints ────────────────────────────────────────────────────


def test_get_objects_catalog():
    r = client.get("/api/objects")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 22
    assert "Component" in body["labels"]
    assert "QualityIncident" in body["labels"]


def test_get_objects_label_returns_400_on_unknown_label():
    r = client.get("/api/objects/Unknown")
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert "Unknown" in detail


def test_get_objects_label_returns_400_on_injection_attempt():
    """A request like /api/objects/X) MATCH ... must NOT execute Cypher."""
    r = client.get("/api/objects/Component)%20DETACH%20DELETE%20n")
    # FastAPI may match the route with the encoded path or 404 it; either way,
    # it must NOT return 200 with data, which would mean the label was used
    # in a Cypher query.
    assert r.status_code in (400, 404, 422)


@patch("api.routers.objects.get_neptune")
def test_get_objects_label_falls_back_to_synthetic_when_neptune_empty(mock_neptune):
    """When Neptune returns no rows, the synthesizer fills in deterministic
    items so the demo never blanks. _synthetic flag must be true."""
    mock_neptune.return_value.run_cypher.return_value = []
    r = client.get("/api/objects/Component?limit=10")
    assert r.status_code == 200
    body = r.json()
    assert body["label"] == "Component"
    assert body["_synthetic"] is True
    assert len(body["items"]) > 0


@patch("api.routers.objects.get_neptune")
def test_get_objects_counts_returns_22_labels(mock_neptune):
    """The /_counts endpoint must enumerate all 22 labels even when Neptune
    is empty (synthetic fallback)."""
    mock_neptune.return_value.run_cypher.return_value = []
    r = client.get("/api/objects/_counts")
    assert r.status_code == 200
    body = r.json()
    counts = body["counts"]
    assert len(counts) == 22
    for cls in ("Component", "Supplier", "Plant", "Telemetry"):
        assert cls in counts
        assert counts[cls] > 0
    assert body["total_nodes"] > 0


@patch("api.routers.objects.get_neptune")
def test_get_object_detail_returns_400_on_unknown_label(mock_neptune):
    mock_neptune.return_value.run_cypher.return_value = []
    r = client.get("/api/objects/UnknownClass/some-id")
    assert r.status_code == 400


@patch("api.routers.objects.get_neptune")
def test_get_object_detail_synthetic_subgraph(mock_neptune):
    """When Neptune has nothing for the (label, id) pair, _synthesize_subgraph
    emits a deterministic 1-hop neighborhood. Edges must reference nodes
    actually in the response (no dangling endpoints — ADR-006 invariant)."""
    mock_neptune.return_value.run_cypher.return_value = []
    r = client.get("/api/objects/Component/AMZN-CMP-IC-00001")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "AMZN-CMP-IC-00001"
    assert body["label"] == "Component"

    # Defense-in-depth invariant: every edge endpoint must exist in nodes.
    node_ids = {n["data"]["id"] for n in body["subgraph"]["nodes"]}
    for edge in body["subgraph"]["edges"]:
        assert edge["data"]["source"] in node_ids
        assert edge["data"]["target"] in node_ids
