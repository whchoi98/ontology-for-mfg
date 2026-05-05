# tests/api/routers/test_insights.py
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app


@patch("api.routers.insights.get_neptune")
def test_insights(mock_neptune):
    mock_neptune.return_value.run_cypher.return_value = [
        {"id": "S1", "name": "X", "otd": 0.95, "quality": 0.9, "responsiveness": 0.8},
    ]
    r = TestClient(app).post("/api/insights", json={"question": "OTD?"})
    assert r.status_code == 200
    assert "summary" in r.json()
