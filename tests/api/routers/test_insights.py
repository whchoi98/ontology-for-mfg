# tests/api/routers/test_insights.py
from unittest.mock import patch

from fastapi.testclient import TestClient

from api.main import app


@patch("api.routers.insights.get_neptune")
def test_insights(mock_neptune):
    mock_neptune.return_value.run_cypher.return_value = [
        {
            "id": "S1",
            "name": "X",
            "region": "KR",
            "recency": 0.95,
            "frequency": 0.9,
            "monetary": 0.8,
        },
    ]
    r = TestClient(app).post("/api/insights", json={"question": "OTD?"})
    assert r.status_code == 200
    body = r.json()
    assert "summary" in body
    assert body["_synthetic"] is False


@patch("api.routers.insights.get_neptune")
def test_insights_does_not_label_rfm_recency_as_otd(mock_neptune):
    """Supplier.rfm_recency is a 0–1 RFM score, not an on-time-delivery %."""
    mock_neptune.return_value.run_cypher.return_value = [
        {
            "id": "S1",
            "name": "X",
            "region": "KR",
            "recency": 0.62,
            "frequency": 0.9,
            "monetary": 0.8,
        },
    ]
    body = TestClient(app).post("/api/insights", json={"question": "협력사 분석"}).json()
    assert "OTD" not in body["summary"]
    assert "OTD" not in body["chart_spec"]["title"]
    assert all("OTD" not in k["label"] for k in body["rows"])
    assert "Recency" in body["summary"]
    # Rendered as a score, not as a percentage.
    assert "62.0%" not in body["summary"]
    assert "0.620" in body["summary"]


@patch("api.routers.insights.get_neptune")
def test_insights_neptune_unconfigured_falls_back(mock_neptune):
    mock_neptune.side_effect = RuntimeError("NEPTUNE_ENDPOINT not configured")
    client = TestClient(app)
    for q in ("협력사 OTD", "탄소 배출 scope", "품질 인시던트"):
        r = client.post("/api/insights", json={"question": q})
        assert r.status_code == 200, q
        assert r.json()["_synthetic"] is True, q


@patch("api.routers.insights.get_neptune")
def test_insights_carbon_tolerates_null_totals(mock_neptune):
    mock_neptune.return_value.run_cypher.return_value = [
        {"id": "P1", "region": None, "total_t": None},
    ]
    r = TestClient(app).post("/api/insights", json={"question": "탄소 배출"})
    assert r.status_code == 200
    assert r.json()["_synthetic"] is True
