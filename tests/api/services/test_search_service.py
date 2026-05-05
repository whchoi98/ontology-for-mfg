# tests/api/services/test_search_service.py
from unittest.mock import MagicMock, patch
from api.services.search import HybridSearchService


@patch("api.services.search.OpenSearch")
@patch("api.services.embedding.boto3.client")
def test_hybrid_returns_top_n(mock_boto, mock_os_cls):
    # Mock embedding
    mock_bedrock = MagicMock()
    mock_bedrock.invoke_model.return_value = {
        "body": MagicMock(read=lambda: b'{"embeddings":[[0.1,0.2,0.3]]}')
    }
    mock_boto.return_value = mock_bedrock
    # Mock OS
    mock_os = MagicMock()
    mock_os.search.side_effect = [
        {"hits": {"hits": [{"_id": "C1", "_score": 1.0, "_source": {"name": "MCU"}}]}},
        {"hits": {"hits": [{"_id": "C2", "_score": 1.0, "_source": {"name": "PCB"}}]}},
    ]
    mock_os_cls.return_value = mock_os

    svc = HybridSearchService(host="dummy", region="ap-northeast-2")
    hits = svc.hybrid_search("BGA package", top_n=10)
    assert len(hits) >= 1
