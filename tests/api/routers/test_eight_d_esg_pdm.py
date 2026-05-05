# tests/api/routers/test_eight_d_esg_pdm.py
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app


@patch("api.routers.eight_d.draft_eight_d")
@patch("api.routers.eight_d.retrieve_kb")
@patch("api.routers.eight_d.get_neptune")
def test_eight_d(mock_n, mock_kb, mock_draft):
    mock_n.return_value.run_cypher.return_value = [
        {"id": "INC-2026-0412", "title": "BGA crack", "component_id": "C1", "plant_id": "P1", "severity": "CRITICAL"},
    ]
    mock_kb.return_value = []
    mock_draft.return_value = {f"d{i}_x": "..." for i in range(1, 9)}
    r = TestClient(app).post("/api/eight-d", json={"incident_id": "INC-2026-0412"})
    assert r.status_code == 200
    assert "eight_d" in r.json()


@patch("api.routers.esg_cbam.get_neptune")
def test_esg(mock_n):
    mock_n.return_value.run_cypher.return_value = [
        {"plant_id": "P1", "region": "KR", "scope": 1, "tons": 100},
        {"plant_id": "P1", "region": "KR", "scope": 2, "tons": 200},
        {"plant_id": "P1", "region": "KR", "scope": 3, "tons": 50},
    ]
    r = TestClient(app).post("/api/esg", json={})
    assert r.status_code == 200
    assert "P1" in r.json()["plants"]


@patch("api.routers.pdm.get_neptune")
def test_pdm(mock_n):
    mock_n.return_value.run_cypher.return_value = [
        {"sensor_id": "AMZN-SENSOR-00001", "metric": "vibration", "unit": "g", "plant_id": "P1"},
    ]
    r = TestClient(app).post("/api/pdm", json={"plant_id": "P1"})
    assert r.status_code == 200
    assert "sensors" in r.json()
