# tests/api/routers/test_chat.py
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app


@patch("api.routers.chat.AgentRunner")
def test_chat_sse_stream(mock_runner_cls):
    mock_runner_cls.return_value.run_stream.return_value = iter([
        {"type": "delta", "text": "hi"},
        {"type": "stop", "reason": "end_turn"},
    ])
    client = TestClient(app)
    with client.stream("POST", "/api/chat", json={"msg": "hi", "session_id": "s1"}) as r:
        assert r.status_code == 200
        body = "".join(r.iter_text())
        assert "delta" in body
