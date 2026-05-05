# tests/api/routers/test_compliance.py
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app


@patch("api.routers.compliance.get_neptune")
def test_compliance_lookup_by_id(mock_neptune):
    mock_neptune.return_value.run_cypher.return_value = [
        {"id": "C1", "name": "MCU", "category": "IC", "substances": ["7439-92-1"], "standards": ["AEC-Q100"]},
    ]
    r = TestClient(app).post("/api/compliance", json={"component_id": "C1"})
    assert r.status_code == 200
    assert r.json()["compliant"] is False  # Lead violates RoHS
