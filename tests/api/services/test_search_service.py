# tests/api/services/test_search_service.py
from unittest.mock import MagicMock, patch

import requests
from botocore.credentials import ReadOnlyCredentials

from api.services.search import HybridSearchService


class _RotatingCreds:
    """Stand-in for botocore RefreshableCredentials (ECS task role): the
    frozen snapshot changes when the provider rotates the keys."""

    def __init__(self) -> None:
        self.current = ReadOnlyCredentials("AKIAOLDKEY", "old-secret", "old-token")

    def get_frozen_credentials(self) -> ReadOnlyCredentials:
        return self.current

    # Attribute access (what a frozen-string signer reads at construction).
    @property
    def access_key(self) -> str:
        return self.current.access_key

    @property
    def secret_key(self) -> str:
        return self.current.secret_key

    @property
    def token(self) -> str:
        return self.current.token


@patch("api.services.search.boto3.Session")
@patch("api.services.search.OpenSearch")
@patch("api.services.embedding.bedrock_runtime")
def test_hybrid_returns_top_n(mock_br, mock_os_cls, mock_session):
    mock_session.return_value.get_credentials.return_value = _RotatingCreds()
    # Mock embedding
    mock_br.return_value.invoke_model.return_value = {
        "body": MagicMock(read=lambda: b'{"embedding":[0.1,0.2,0.3]}')
    }
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


@patch("api.services.search.boto3.Session")
@patch("api.services.search.OpenSearch")
def test_aoss_auth_picks_up_rotated_credentials(mock_os_cls, mock_session):
    """The singleton service must sign with the *current* task-role keys.
    Freezing access/secret/token strings at construction makes every AOSS
    call 403 after ECS rotates the credentials (until the task restarts)."""
    creds = _RotatingCreds()
    mock_session.return_value.get_credentials.return_value = creds
    HybridSearchService(host="dummy.aoss.amazonaws.com", region="ap-northeast-2")
    auth = mock_os_cls.call_args.kwargs["http_auth"]

    def _signed_headers() -> dict:
        req = requests.Request(
            "POST", "https://dummy.aoss.amazonaws.com/mfg-search/_search", data=b"{}"
        ).prepare()
        return dict(auth(req).headers)

    h1 = _signed_headers()
    assert "AKIAOLDKEY" in h1["Authorization"]
    assert "/aoss/" in h1["Authorization"]

    creds.current = ReadOnlyCredentials("AKIANEWKEY", "new-secret", "new-token")
    h2 = _signed_headers()
    assert "AKIANEWKEY" in h2["Authorization"]
    assert h2["X-Amz-Security-Token"] == "new-token"
