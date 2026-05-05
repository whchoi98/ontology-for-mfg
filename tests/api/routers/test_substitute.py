# tests/api/routers/test_substitute.py
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app


@patch("api.routers.substitute.get_neptune")
def test_substitute(mock_neptune):
    mock_neptune.return_value.run_cypher.return_value = [
        {"id": "C2", "name": "MCU-alt", "category": "IC", "shared_standards": ["AEC-Q100"]},
    ]
    r = TestClient(app).post("/api/substitute", json={"component_id": "C1"})
    assert r.status_code == 200
    assert len(r.json()["candidates"]) >= 1
