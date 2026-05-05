# tests/api/routers/test_spec_match.py
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app


@patch("api.routers.spec_match.rerank")
@patch("api.routers.spec_match.get_search")
def test_spec_match(mock_s, mock_r):
    mock_s.return_value.hybrid_search.return_value = [{"_id": "C1", "_source": {"name": "x"}}]
    mock_r.return_value = [{"id": "C1", "name": "x", "rerank_score": 0.9}]
    r = TestClient(app).post("/api/spec-match", json={"requirements": "8 inch QHD display"})
    assert r.status_code == 200 and "candidates" in r.json()
