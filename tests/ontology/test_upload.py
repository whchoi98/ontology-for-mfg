from unittest.mock import MagicMock, patch
from ontology.upload import upload_schema_to_neptune


@patch("ontology.upload.requests.post")
def test_upload_calls_sparql_endpoint(mock_post):
    mock_post.return_value = MagicMock(status_code=200, text="OK")
    upload_schema_to_neptune(endpoint="https://neptune.local:8182", schema_path="ontology/schema.ttl")
    args, kwargs = mock_post.call_args
    assert "neptune.local" in args[0] or "neptune.local" in kwargs.get("url", "")
    # SPARQL UPDATE endpoint
    assert "/sparql" in args[0] or "/sparql" in kwargs.get("url", "")
