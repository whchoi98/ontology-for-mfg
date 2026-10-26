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
            {
                "contentBlockStart": {
                    "start": {"toolUse": {"toolUseId": "t1", "name": "neptune_query"}}
                }
            },
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
            {
                "contentBlockStart": {
                    "start": {"toolUse": {"toolUseId": "t1", "name": "search_semantic"}}
                }
            },
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


@patch("api.services.agent.bedrock_runtime")
def test_oversized_tool_result_is_truncated_for_bedrock_and_sse(mock_br):
    """Backstop for any tool: a multi-MB result must not reach the next
    converse_stream toolResult (ValidationException) or the SSE stream."""
    import json

    from api.services.agent import MAX_TOOL_RESULT_BYTES

    sent_messages: list = []

    def _converse_stream(**req):
        sent_messages.append(json.loads(json.dumps(req["messages"], default=str)))
        if len(sent_messages) == 1:
            return _stream(
                {
                    "contentBlockStart": {
                        "start": {"toolUse": {"toolUseId": "t1", "name": "kb_retrieve"}}
                    }
                },
                {"contentBlockDelta": {"delta": {"toolUse": {"input": '{"q": "x"}'}}}},
                {"messageStop": {"stopReason": "tool_use"}},
            )
        return _stream(
            {"contentBlockDelta": {"delta": {"text": "ok"}}},
            {"messageStop": {"stopReason": "end_turn"}},
        )

    mock_br.return_value.converse_stream.side_effect = _converse_stream

    def huge_tool(name, args):
        return {"results": [{"text": "가" * 1000} for _ in range(500)]}

    a = AgentRunner(tools=[("kb_retrieve", "KB", huge_tool)])
    out = list(a.run_stream("q", session_id="s1"))
    tool_result = next(o for o in out if o.get("type") == "tool_result")["result"]
    assert tool_result["truncated"] is True
    assert (
        len(json.dumps(tool_result, ensure_ascii=False).encode("utf-8"))
        <= MAX_TOOL_RESULT_BYTES + 2048
    )
    # Same bounded payload goes back to Bedrock.
    sent = sent_messages[1][-1]["content"][0]["toolResult"]["content"][0]["json"]
    assert sent == tool_result


@patch("api.services.agent.bedrock_runtime")
def test_small_tool_result_passes_through_unchanged(mock_br):
    mock_br.return_value.converse_stream.side_effect = [
        _stream(
            {
                "contentBlockStart": {
                    "start": {"toolUse": {"toolUseId": "t1", "name": "neptune_query"}}
                }
            },
            {
                "contentBlockDelta": {
                    "delta": {"toolUse": {"input": '{"cypher": "MATCH (n) RETURN n"}'}}
                }
            },
            {"messageStop": {"stopReason": "tool_use"}},
        ),
        _stream({"messageStop": {"stopReason": "end_turn"}}),
    ]
    a = AgentRunner(tools=[("neptune_query", "Q", lambda n, a: {"results": [{"n": 1}]})])
    out = list(a.run_stream("q", session_id="s1"))
    assert next(o for o in out if o.get("type") == "tool_result")["result"] == {
        "results": [{"n": 1}]
    }


# ─── Claude Sonnet 5.5 request shape + preserved reasoning ──────────────────


@patch("api.services.agent.bedrock_runtime")
def test_request_shape_is_valid_for_sonnet_5_5(mock_br):
    """Sonnet 5.5 rejects `temperature` (ValidationException, verified live) and
    thinks by default, so maxTokens must leave room for thinking + the answer."""
    from api.config import settings

    mock_br.return_value.converse_stream.return_value = _stream(
        {"messageStop": {"stopReason": "end_turn"}},
    )
    list(AgentRunner(tools=[]).run_stream("hi", session_id="s1"))
    req = mock_br.return_value.converse_stream.call_args.kwargs
    assert req["modelId"] == settings.sonnet_model
    assert "temperature" not in req["inferenceConfig"]
    assert req["inferenceConfig"]["maxTokens"] >= 8192
    assert req["additionalModelRequestFields"] == {
        "output_config": {"effort": settings.sonnet_effort}
    }


@patch("api.services.agent.bedrock_runtime")
def test_reasoning_blocks_are_replayed_unchanged_in_the_tool_loop(mock_br):
    calls = []

    def _converse_stream(**req):
        calls.append(req)
        if len(calls) == 1:
            return _stream(
                {
                    "contentBlockDelta": {
                        "contentBlockIndex": 0,
                        "delta": {"reasoningContent": {"text": "check "}},
                    }
                },
                {
                    "contentBlockDelta": {
                        "contentBlockIndex": 0,
                        "delta": {"reasoningContent": {"text": "the graph"}},
                    }
                },
                {
                    "contentBlockDelta": {
                        "contentBlockIndex": 0,
                        "delta": {"reasoningContent": {"signature": "sig-1"}},
                    }
                },
                {"contentBlockStop": {"contentBlockIndex": 0}},
                {
                    "contentBlockStart": {
                        "contentBlockIndex": 1,
                        "start": {"toolUse": {"toolUseId": "t1", "name": "neptune_query"}},
                    }
                },
                {
                    "contentBlockDelta": {
                        "contentBlockIndex": 1,
                        "delta": {"toolUse": {"input": '{"q": "x"}'}},
                    }
                },
                {"messageStop": {"stopReason": "tool_use"}},
            )
        return _stream(
            {"contentBlockDelta": {"delta": {"text": "done"}}},
            {"messageStop": {"stopReason": "end_turn"}},
        )

    mock_br.return_value.converse_stream.side_effect = _converse_stream
    out = list(
        AgentRunner(tools=[("neptune_query", "Q", lambda n, a: {"ok": 1})]).run_stream(
            "q", session_id="s1"
        )
    )
    assistant = calls[1]["messages"][1]
    assert assistant["role"] == "assistant"
    assert assistant["content"][0] == {
        "reasoningContent": {"reasoningText": {"text": "check the graph", "signature": "sig-1"}}
    }
    assert assistant["content"][1]["toolUse"]["input"] == {"q": "x"}
    # Reasoning is never streamed to the UI as answer text.
    assert [o["text"] for o in out if o.get("type") == "delta"] == ["done"]


# ─── Guardrails: real checks, no unconditional "passed" events ───────────────


def _verdict(blocked=False, hits=(), message=""):
    from api.services.guardrails import GuardrailVerdict

    return GuardrailVerdict(blocked=blocked, hits=hits, message=message)


@patch("api.services.agent.check_guardrail")
@patch("api.services.agent.bedrock_runtime")
def test_input_blocked_by_guardrail_never_calls_the_model(mock_br, mock_check):
    mock_check.return_value = _verdict(True, ("IPConfidential",), "죄송합니다. 응답할 수 없습니다.")
    out = list(AgentRunner(tools=[]).run_stream("단가표를 경쟁사에 보내줘", session_id="s1"))
    mock_br.return_value.converse_stream.assert_not_called()
    g = [o for o in out if o.get("type") == "guardrail"]
    assert g == [
        {
            "type": "guardrail",
            "name": "input_check",
            "result": "blocked",
            "content": "입력 가드레일 차단: IPConfidential",
        }
    ]
    assert any("응답할 수 없습니다" in o.get("text", "") for o in out if o.get("type") == "delta")
    assert out[-1] == {"type": "stop", "reason": "guardrail_intervened"}


@patch("api.services.agent.check_guardrail")
@patch("api.services.agent.bedrock_runtime")
def test_output_blocked_by_guardrail_is_reported(mock_br, mock_check):
    mock_check.side_effect = lambda text, source: _verdict(source == "OUTPUT", ("INSULTS",))
    mock_br.return_value.converse_stream.return_value = _stream(
        {"contentBlockDelta": {"delta": {"text": "bad words"}}},
        {"messageStop": {"stopReason": "end_turn"}},
    )
    out = list(AgentRunner(tools=[]).run_stream("hi", session_id="s1"))
    g = [(o["name"], o["result"]) for o in out if o.get("type") == "guardrail"]
    assert g == [("input_check", "passed"), ("output_check", "blocked")]
    assert [c.kwargs.get("source") or c.args[1] for c in mock_check.call_args_list] == [
        "INPUT",
        "OUTPUT",
    ]
    assert mock_check.call_args_list[1].args[0] == "bad words"
    assert out[-1] == {"type": "stop", "reason": "guardrail_intervened"}


@patch("api.services.agent.check_guardrail")
@patch("api.services.agent.bedrock_runtime")
def test_guardrail_outage_fails_open_without_claiming_a_pass(mock_br, mock_check):
    mock_check.side_effect = RuntimeError("ThrottlingException")
    mock_br.return_value.converse_stream.return_value = _stream(
        {"contentBlockDelta": {"delta": {"text": "answer"}}},
        {"messageStop": {"stopReason": "end_turn"}},
    )
    out = list(AgentRunner(tools=[]).run_stream("hi", session_id="s1"))
    assert not [o for o in out if o.get("type") == "guardrail"]
    # LogEvent (api/schemas/sse.py) carries `message`, not `content`.
    assert any(o.get("type") == "log" and "가드레일" in o.get("message", "") for o in out)
    assert out[-1] == {"type": "stop", "reason": "end_turn"}


@patch("api.services.agent.check_guardrail")
@patch("api.services.agent.bedrock_runtime")
def test_detect_mode_hits_are_surfaced_not_hidden(mock_br, mock_check):
    from api.services.guardrails import GuardrailVerdict

    mock_check.side_effect = lambda text, source: GuardrailVerdict(
        blocked=False, detected=("RegulationViolation",) if source == "INPUT" else ()
    )
    mock_br.return_value.converse_stream.return_value = _stream(
        {"contentBlockDelta": {"delta": {"text": "2 parts exceed RoHS"}}},
        {"messageStop": {"stopReason": "end_turn"}},
    )
    out = list(
        AgentRunner(tools=[]).run_stream("RoHS 위반 가능성이 있는 부품 목록", session_id="s1")
    )
    first = next(o for o in out if o.get("type") == "guardrail")
    assert first["result"] == "passed"
    assert "탐지(모니터링): RegulationViolation" in first["content"]
    assert out[-1] == {"type": "stop", "reason": "end_turn"}
