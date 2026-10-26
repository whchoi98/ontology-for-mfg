# tests/api/services/test_neptune_service.py
from unittest.mock import MagicMock, patch

from botocore.credentials import ReadOnlyCredentials

from api.services.neptune import NeptuneClient


def _ok(results):
    return MagicMock(ok=True, status_code=200, json=lambda: {"results": results})


def _creds():
    c = MagicMock()
    c.get_frozen_credentials.return_value = ReadOnlyCredentials("AKIA", "secret", "token")
    return c


@patch("api.services.neptune.boto3.Session")
@patch("api.services.neptune.requests.Session")
def test_run_cypher_posts_to_endpoint(mock_http_cls, mock_boto_session):
    mock_boto_session.return_value.get_credentials.return_value = _creds()
    mock_http_cls.return_value.post.return_value = _ok([{"label": "Component", "n": 3000}])
    c = NeptuneClient(endpoint="https://neptune.local:8182")
    out = c.run_cypher("MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n", {})
    assert out == [{"label": "Component", "n": 3000}]
    args, kwargs = mock_http_cls.return_value.post.call_args
    assert "/openCypher" in args[0]
    assert "Authorization" in kwargs["headers"]


@patch("api.services.neptune.boto3.Session")
@patch("api.services.neptune.requests.Session")
def test_run_cypher_reuses_http_pool_and_credential_provider(mock_http_cls, mock_boto_session):
    """B10: one pooled HTTP session + one refreshable credential provider per
    client — not a fresh boto3.Session and un-pooled requests.post per query."""
    creds = _creds()
    mock_boto_session.return_value.get_credentials.return_value = creds
    mock_http_cls.return_value.post.return_value = _ok([])
    c = NeptuneClient(endpoint="https://neptune.local:8182")
    for _ in range(3):
        c.run_cypher("MATCH (n) RETURN n LIMIT 1", {})
    assert mock_http_cls.call_count == 1
    assert mock_http_cls.return_value.post.call_count == 3
    assert mock_boto_session.call_count == 1
    # Frozen snapshot is taken per request so rotated keys are picked up.
    assert creds.get_frozen_credentials.call_count == 3


def test_subgraph_for_component_query_shape():
    c = NeptuneClient(endpoint="x")
    q = c.build_subgraph_query(["AMZN-CMP-IC-00001"], hops=1)
    assert "MATCH" in q
    assert "AMZN-CMP-IC-00001" in q or "$ids" in q


def test_rows_to_cytoscape_uses_application_ids_and_properties():
    """B8: Neptune returns `~properties` (not `properties`) and `~start` /
    `~end` are internal ids — nodes must expose app id + props and edges
    must be remapped onto them (ADR-006)."""
    rows = [
        {
            "n": {
                "~id": "uuid-1",
                "~labels": ["Component"],
                "~properties": {"id": "AMZN-CMP-IC-00001", "name": "MCU", "category": "IC"},
            },
            "r": [{"~id": "rel-1", "~type": "CONFORMS_TO", "~start": "uuid-1", "~end": "uuid-2"}],
            "m": {
                "~id": "uuid-2",
                "~labels": ["Standard"],
                "~properties": {"id": "AEC-Q100", "title": "IC Stress Test"},
            },
        },
        {  # second hop edge to a node we never received → must be dropped
            "n": {
                "~id": "uuid-1",
                "~labels": ["Component"],
                "~properties": {"id": "AMZN-CMP-IC-00001", "name": "MCU"},
            },
            "r": [{"~id": "rel-2", "~type": "SUPPLIED_BY", "~start": "uuid-1", "~end": "uuid-9"}],
            "m": None,
        },
    ]
    g = NeptuneClient._rows_to_cytoscape(rows)
    nodes = {n["data"]["id"]: n["data"] for n in g["nodes"]}
    assert set(nodes) == {"AMZN-CMP-IC-00001", "AEC-Q100"}
    assert nodes["AMZN-CMP-IC-00001"]["name"] == "MCU"
    assert nodes["AMZN-CMP-IC-00001"]["label"] == "Component"
    assert nodes["AMZN-CMP-IC-00001"]["category"] == "IC"
    assert nodes["AEC-Q100"]["label"] == "Standard"
    assert g["edges"] == [
        {
            "data": {
                "id": "rel-1",
                "source": "AMZN-CMP-IC-00001",
                "target": "AEC-Q100",
                "type": "CONFORMS_TO",
            }
        }
    ]
