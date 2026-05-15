# tests/api/services/test_agent_service.py
"""AgentRunner tests against the v0.5.6 converse_stream API.

These tests mock `bedrock_runtime().converse_stream(...)` to return an
iterable of streaming events. Each event has exactly one of:
- `contentBlockStart` (with `start.toolUse` for tool blocks)
- `contentBlockDelta` (with `delta.text` for text chunks OR
   `delta.toolUse.input` for tool-input JSON chunks)
- `messageStop` (with `stopReason`)
"""
from unittest.mock import patch
from api.services.agent import AgentRunner


def _stream(*events):
    """Build a converse_stream response dict from a sequence of event dicts."""
    return {"stream": list(events)}


@patch("api.services.agent.bedrock_runtime")
def test_single_turn_no_tools(mock_br):
    mock_br.return_value.converse_stream.return_value = _stream(
        {"contentBlockDelta": {"delta": {"text": "hello"}}},
        {"messageStop": {"stopReason": "end_turn"}},
    )
    a = AgentRunner(tools=[])
    out = list(a.run_stream("hi", session_id="s1"))
    text_chunks = [o for o in out if o.get("type") == "delta"]
    assert any("hello" in c.get("text", "") for c in text_chunks)
    # Token-level streaming guarantee — at least one delta arrives.
    assert text_chunks, "expected at least one delta event"


@patch("api.services.agent.bedrock_runtime")
def test_delta_per_chunk(mock_br):
    """Multiple contentBlockDelta events → multiple SSE delta events.
    This is the user-visible improvement v0.5.6 ships."""
    mock_br.return_value.converse_stream.return_value = _stream(
        {"contentBlockDelta": {"delta": {"text": "안녕"}}},
        {"contentBlockDelta": {"delta": {"text": "하세요"}}},
        {"contentBlockDelta": {"delta": {"text": " Manny입니다"}}},
        {"messageStop": {"stopReason": "end_turn"}},
    )
    a = AgentRunner(tools=[])
    out = list(a.run_stream("hi", session_id="s1"))
    delta_texts = [o["text"] for o in out if o.get("type") == "delta"]
    assert delta_texts == ["안녕", "하세요", " Manny입니다"]


@patch("api.services.agent.bedrock_runtime")
def test_tool_call_dispatch(mock_br):
    # Turn 1: tool use (input streamed as JSON chunks); Turn 2: end with text
    mock_br.return_value.converse_stream.side_effect = [
        _stream(
            {"contentBlockStart": {"start": {"toolUse": {"toolUseId": "t1", "name": "neptune_query"}}}},
            {"contentBlockDelta": {"delta": {"toolUse": {"input": '{"q":'}}}},
            {"contentBlockDelta": {"delta": {"toolUse": {"input": ' "MATCH (n) RETURN n"}'}}}},
            {"messageStop": {"stopReason": "tool_use"}},
        ),
        _stream(
            {"contentBlockDelta": {"delta": {"text": "found 80 products"}}},
            {"messageStop": {"stopReason": "end_turn"}},
        ),
    ]
    captured_args = {}

    def fake_tool(name, args):
        captured_args.update(args)
        return {"results": [{"n": 80}]}

    a = AgentRunner(tools=[("neptune_query", "Query Neptune", fake_tool)])
    out = list(a.run_stream("how many products?", session_id="s1"))
    tool_calls = [o for o in out if o.get("type") == "tool_call"]
    assert tool_calls, "expected a tool_call event"
    assert tool_calls[0]["name"] == "neptune_query"
    # The accumulated JSON chunks parse into the original dict.
    assert captured_args == {"q": "MATCH (n) RETURN n"}


@patch("api.services.agent.bedrock_runtime")
def test_tool_input_invalid_json_falls_back_to_empty(mock_br):
    """Malformed streaming JSON for toolUse.input → {} (warn-and-continue
    instead of crashing the agent loop)."""
    mock_br.return_value.converse_stream.side_effect = [
        _stream(
            {"contentBlockStart": {"start": {"toolUse": {"toolUseId": "t1", "name": "search_semantic"}}}},
            {"contentBlockDelta": {"delta": {"toolUse": {"input": '{"q": broken'}}}},
            {"messageStop": {"stopReason": "tool_use"}},
        ),
        _stream(
            {"contentBlockDelta": {"delta": {"text": "fallback"}}},
            {"messageStop": {"stopReason": "end_turn"}},
        ),
    ]
    received_args: list[dict] = []

    def fake_tool(name, args):
        received_args.append(args)
        return {"ok": True}

    a = AgentRunner(tools=[("search_semantic", "Search", fake_tool)])
    list(a.run_stream("query", session_id="s1"))
    assert received_args == [{}]


@patch("api.services.agent.bedrock_runtime")
def test_bedrock_failure_emits_error_and_stop(mock_br):
    """A converse_stream exception must produce a clean error+stop
    sequence — never a silent connection close."""
    mock_br.return_value.converse_stream.side_effect = RuntimeError("throttled")
    a = AgentRunner(tools=[])
    out = list(a.run_stream("hi", session_id="s1"))
    types = [o.get("type") for o in out]
    assert "error" in types
    assert types[-1] == "stop"
    assert out[-1].get("reason") == "bedrock_error"
