# tests/api/services/test_neptune_service.py
from unittest.mock import patch, MagicMock
from api.services.neptune import NeptuneClient


@patch("api.services.neptune.requests.post")
def test_run_cypher_posts_to_endpoint(mock_post):
    mock_post.return_value = MagicMock(
        status_code=200,
        json=lambda: {"results": [{"label": "Component", "n": 3000}]},
    )
    c = NeptuneClient(endpoint="https://neptune.local:8182")
    out = c.run_cypher("MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n", {})
    assert out == [{"label": "Component", "n": 3000}]
    args, kwargs = mock_post.call_args
    assert "/openCypher" in args[0]


def test_subgraph_for_component_query_shape():
    c = NeptuneClient(endpoint="x")
    q = c.build_subgraph_query(["AMZN-CMP-IC-00001"], hops=1)
    assert "MATCH" in q
    assert "AMZN-CMP-IC-00001" in q or "$ids" in q
