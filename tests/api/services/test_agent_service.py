# tests/api/services/test_agent_service.py
from unittest.mock import patch, MagicMock  # noqa: F401
from api.services.agent import AgentRunner


@patch("api.services.agent.bedrock_runtime")
def test_single_turn_no_tools(mock_br):
    mock_br.return_value.converse.return_value = {
        "output": {"message": {"content": [{"text": "hello"}]}},
        "stopReason": "end_turn",
    }
    a = AgentRunner(tools=[])
    out = list(a.run_stream("hi", session_id="s1"))
    text_chunks = [o for o in out if o.get("type") == "delta"]
    assert any("hello" in c.get("text", "") for c in text_chunks)


@patch("api.services.agent.bedrock_runtime")
def test_tool_call_dispatch(mock_br):
    # First turn: model returns tool_use; second turn: end with text
    mock_br.return_value.converse.side_effect = [
        {"output": {"message": {"content": [{"toolUse": {"toolUseId": "t1", "name": "neptune_query", "input": {"q": "MATCH (n) RETURN n"}}}]}}, "stopReason": "tool_use"},
        {"output": {"message": {"content": [{"text": "found 80 products"}]}}, "stopReason": "end_turn"},
    ]
    def fake_tool(name, args):
        return {"results": [{"n": 80}]}
    a = AgentRunner(tools=[("neptune_query", "Query Neptune", fake_tool)])
    out = list(a.run_stream("how many products?", session_id="s1"))
    assert any(o.get("type") == "tool_call" for o in out)
