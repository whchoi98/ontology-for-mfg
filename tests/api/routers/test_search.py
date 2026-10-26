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
    mock_rerank.return_value = [
        {"id": "C1", "name": "MCU", "label": "Component", "rerank_score": 0.9}
    ]
    mock_neptune.return_value.subgraph_for.return_value = {
        "nodes": [{"data": {"id": "C1"}}],
        "edges": [],
    }
    client = TestClient(app)
    r = client.post("/api/search", json={"q": "BGA package"})
    assert r.status_code == 200
    body = r.json()
    assert "hits" in body and "subgraph" in body
    assert body["_synthetic"] is False


@patch("api.routers.search.get_neptune")
@patch("api.routers.search.get_search")
def test_search_falls_back_when_opensearch_unavailable(mock_search, mock_neptune):
    """AOSS 403 / unreachable must degrade to synthetic hits, not a 500."""
    mock_search.return_value.hybrid_search.side_effect = RuntimeError("AuthorizationException(403)")
    mock_neptune.side_effect = RuntimeError("NEPTUNE_ENDPOINT not configured")
    r = TestClient(app).post("/api/search", json={"q": "차량용 BGA", "top_n": 5})
    assert r.status_code == 200
    body = r.json()
    assert body["_synthetic"] is True
    assert 0 < len(body["hits"]) <= 5
    assert body["subgraph"]["nodes"]


@patch("api.routers.search.get_search")
def test_search_falls_back_when_search_service_init_fails(mock_search):
    mock_search.side_effect = ValueError("Credentials cannot be empty")
    r = TestClient(app).post("/api/search", json={"q": "AEC-Q100"})
    assert r.status_code == 200
    assert r.json()["_synthetic"] is True


@patch("api.routers.search.get_neptune")
@patch("api.routers.search.rerank")
@patch("api.routers.search.get_search")
def test_search_neptune_unconfigured_does_not_500(mock_search, mock_rerank, mock_neptune):
    mock_search.return_value.hybrid_search.return_value = [
        {
            "_id": "auto-1",
            "_source": {"id": "AMZN-CMP-IC-00001", "name": "MCU", "label": "Component"},
        },
    ]
    mock_rerank.side_effect = lambda q, docs, top_n: docs[:top_n]
    mock_neptune.side_effect = RuntimeError("NEPTUNE_ENDPOINT not configured")
    r = TestClient(app).post("/api/search", json={"q": "MCU"})
    assert r.status_code == 200
    body = r.json()
    assert body["hits"][0]["id"] == "AMZN-CMP-IC-00001"
    assert body["_synthetic"] is True
    node_ids = {n["data"]["id"] for n in body["subgraph"]["nodes"]}
    for e in body["subgraph"]["edges"]:
        assert e["data"]["source"] in node_ids and e["data"]["target"] in node_ids
