# tests/api/routers/test_search.py
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app


@patch("api.routers.search.get_neptune")
@patch("api.routers.search.rerank")
@patch("api.routers.search.get_search")
def test_search_endpoint(mock_search, mock_rerank, mock_neptune):
    mock_search.return_value.hybrid_search.return_value = [
        {"_id": "C1", "_source": {"name": "MCU", "label": "Component"}},
    ]
    mock_rerank.return_value = [{"id": "C1", "name": "MCU", "label": "Component", "rerank_score": 0.9}]
    mock_neptune.return_value.subgraph_for.return_value = {"nodes": [{"data": {"id": "C1"}}], "edges": []}
    client = TestClient(app)
    r = client.post("/api/search", json={"q": "BGA package"})
    assert r.status_code == 200
    body = r.json()
    assert "hits" in body and "subgraph" in body
