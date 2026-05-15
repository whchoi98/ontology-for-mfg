# tests/api/routers/test_chat.py
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app


@patch("api.routers.chat.generate_followups", return_value=[])
@patch("api.routers.chat.AgentRunner")
def test_chat_sse_stream(mock_runner_cls, _mock_fu):
    mock_runner_cls.return_value.run_stream.return_value = iter([
        {"type": "delta", "text": "hi"},
        {"type": "stop", "reason": "end_turn"},
    ])
    client = TestClient(app)
    with client.stream("POST", "/api/chat", json={"msg": "hi", "session_id": "s1"}) as r:
        assert r.status_code == 200
        body = "".join(r.iter_text())
        assert "delta" in body


@patch("api.routers.chat.generate_followups")
@patch("api.routers.chat.AgentRunner")
def test_chat_emits_suggested_followups_before_stop(mock_runner_cls, mock_fu):
    """The chat router must inject suggested_followups *before* the stop
    event so clients that close on stop still pick them up. Drives the
    UI's follow-up chip rendering."""
    mock_runner_cls.return_value.run_stream.return_value = iter([
        {"type": "delta", "text": "AEC-Q100 인증 후보 5개입니다."},
        {"type": "stop", "reason": "end_turn"},
    ])
    mock_fu.return_value = ["대체품 EOL 일정", "Tier-1 OTD 비교", "REACH 위반 위험"]
    client = TestClient(app)
    with client.stream("POST", "/api/chat",
                       json={"msg": "AEC-Q100 대체품", "session_id": "s1", "persona": "engineer"}) as r:
        assert r.status_code == 200
        body = "".join(r.iter_text())

    mock_fu.assert_called_once()
    args = mock_fu.call_args[0]
    assert args[0] == "AEC-Q100 인증 후보 5개입니다."
    assert args[1] == "engineer"
    assert args[2] == "AEC-Q100 대체품"

    fu_idx = body.find("suggested_followups")
    stop_idx = body.find('"stop"')
    assert fu_idx != -1 and stop_idx != -1
    assert fu_idx < stop_idx
    assert "대체품 EOL 일정" in body


@patch("api.routers.chat.generate_followups", return_value=[])
@patch("api.routers.chat.AgentRunner")
def test_chat_skips_followups_when_empty(mock_runner_cls, _mock_fu):
    """Empty followups → no suggested_followups event in the stream."""
    mock_runner_cls.return_value.run_stream.return_value = iter([
        {"type": "delta", "text": "ok"},
        {"type": "stop", "reason": "end_turn"},
    ])
    client = TestClient(app)
    with client.stream("POST", "/api/chat",
                       json={"msg": "ping", "session_id": "s1"}) as r:
        body = "".join(r.iter_text())
    assert "suggested_followups" not in body
