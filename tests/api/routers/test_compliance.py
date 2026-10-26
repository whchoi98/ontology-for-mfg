# tests/api/routers/test_compliance.py
from unittest.mock import patch

from fastapi.testclient import TestClient

from api.main import app


@patch("api.routers.compliance.get_neptune")
def test_compliance_lookup_by_id(mock_neptune):
    mock_neptune.return_value.run_cypher.return_value = [
        {
            "id": "C1",
            "name": "MCU",
            "category": "IC",
            "substances": ["7439-92-1"],
            "standards": ["AEC-Q100"],
        },
    ]
    r = TestClient(app).post("/api/compliance", json={"component_id": "C1"})
    assert r.status_code == 200
    assert r.json()["compliant"] is False  # Lead violates RoHS


@patch("api.routers.compliance.get_neptune")
def test_compliance_real_component_without_substances_is_insufficient_data(mock_neptune):
    """Neptune hit, but the component carries no substance declaration (the
    graph loader drops list props). Must NOT report compliant/_synthetic:false."""
    mock_neptune.return_value.run_cypher.return_value = [
        {"id": "C9", "name": "MCU", "category": "IC", "substances": None, "standards": None},
    ]
    r = TestClient(app).post("/api/compliance", json={"component_id": "C9"})
    assert r.status_code == 200
    body = r.json()
    assert body["compliant"] is None
    assert body["status"] == "insufficient_data"
    assert body["_synthetic"] is False
    assert body["violations"] == []


@patch("api.routers.compliance.get_neptune")
def test_compliance_neptune_unconfigured_falls_back_to_synthetic(mock_neptune):
    mock_neptune.side_effect = RuntimeError("NEPTUNE_ENDPOINT not configured")
    r = TestClient(app).post("/api/compliance", json={"component_id": "AMZN-CMP-IC-00007"})
    assert r.status_code == 200
    body = r.json()
    assert body["_synthetic"] is True
    assert body["status"] in ("compliant", "non_compliant")


def test_compliance_synthetic_demo_still_shows_both_verdicts():
    """Synthetic fallback declares benign substances for clean parts so the
    demo keeps a green path even though empty declarations are now unknown."""
    from api.routers.compliance import evaluate_component

    with patch("api.routers.compliance.get_neptune", side_effect=RuntimeError("down")):
        statuses = {evaluate_component(f"AMZN-CMP-IC-{i:05d}")["status"] for i in range(1, 40)}
    assert {"compliant", "non_compliant"} <= statuses


@patch("api.routers.compliance.get_neptune")
def test_compliance_reads_comma_joined_substance_prop(mock_neptune):
    """Neptune has no list properties; the graph loader stores
    Component.substances / standards comma-joined."""
    mock_neptune.return_value.run_cypher.return_value = [
        {
            "id": "C2",
            "name": "MCU",
            "category": "IC",
            "substances": "7439-92-1,117-81-7",
            "standards": "AEC-Q100,JESD22",
        },
    ]
    body = TestClient(app).post("/api/compliance", json={"component_id": "C2"}).json()
    assert body["status"] == "non_compliant"
    assert {v["substance"] for v in body["violations"]} == {"7439-92-1", "117-81-7"}
    assert body["component"]["standards"] == ["AEC-Q100", "JESD22"]
    assert body["checked_against"]["AEC-Q100"] is True


@patch("api.routers.compliance.get_neptune")
def test_compliance_empty_serialized_substances_is_insufficient_data(mock_neptune):
    mock_neptune.return_value.run_cypher.return_value = [
        {"id": "C3", "name": "MCU", "category": "IC", "substances": "", "standards": ""},
    ]
    body = TestClient(app).post("/api/compliance", json={"component_id": "C3"}).json()
    assert body["status"] == "insufficient_data"
    assert body["compliant"] is None
