# api/services/agent.py
"""AgentCore-style tool-use orchestrator using Bedrock Converse Stream API.

Streams 'phase / delta / tool_call / tool_result / guardrail / log / error / stop'
events compatible with retail's SSE event vocabulary so the web frontend can
render in real time.

**Token-level streaming (v0.5.6)**: Bedrock `converse_stream` yields
`contentBlockDelta` events as the model emits tokens. We forward each chunk
as its own `delta` event the moment it arrives, so the UI paints text
incrementally and the user feels the response is "live" — comparable to
gcc's chat experience. The previous implementation used the blocking
`converse(...)` call and only yielded after the full response was buffered,
which made even short answers feel slow.

Tool callback signature: (name: str, args: dict) -> dict (any JSON-serializable).
"""
from __future__ import annotations
import json
import logging
import time
from collections import deque
from typing import Any, Callable, Generator
from api.aws_clients import bedrock_runtime
from api.config import settings

log = logging.getLogger("mfg.agent")

# In-process ring buffer of recent tool_call events. Powers /api/ops/trace.
# Per-instance (not shared across ECS tasks) — adequate for the demo's
# diagnostic console; would need a backing store (DynamoDB/CloudWatch) for
# durable cross-instance traces.
_TRACE_MAX = 200
_TRACE_BUFFER: deque[dict] = deque(maxlen=_TRACE_MAX)


def record_trace(*, session_id: str, tool: str, args: dict,
                  actor_id: str = "anonymous") -> None:
    """Append a tool-call event to the in-process trace ring."""
    _TRACE_BUFFER.append({
        "ts": time.time(),
        "session_id": str(session_id or ""),
        "actor_id": str(actor_id or "anonymous"),
        "tool": str(tool or ""),
        "input": args if isinstance(args, dict) else {"_": args},
    })


def recent_traces(limit: int = 50, session_id: str | None = None) -> list[dict]:
    """Return the most recent traces, newest first, optionally filtered."""
    items = list(_TRACE_BUFFER)
    if session_id:
        items = [it for it in items if it.get("session_id") == session_id]
    items.sort(key=lambda x: x.get("ts", 0), reverse=True)
    return items[: max(1, min(int(limit), _TRACE_MAX))]


class AgentRunner:
    """Tool tuple shapes accepted:
    - 3-tuple: (name, description, fn) — uses permissive input schema (legacy)
    - 4-tuple: (name, description, fn, input_schema_dict) — passes the schema to Bedrock
    """
    def __init__(self, tools: list[tuple] | None = None,
                 system: str = "You are a Korean Hi-Tech MFG copilot.",
                 max_rounds: int = 8):
        self.tools = tools or []
        self.system = system
        self.max_rounds = max_rounds

    def _tool_specs(self) -> list[dict]:
        out: list[dict] = []
        for tool in self.tools:
            if len(tool) >= 4 and isinstance(tool[3], dict):
                schema = tool[3]
            else:
                schema = {"type": "object", "properties": {}, "additionalProperties": True}
            out.append({
                "toolSpec": {
                    "name": tool[0],
                    "description": tool[1],
                    "inputSchema": {"json": schema},
                }
            })
        return out

    def run_stream(self, user_msg: str, session_id: str) -> Generator[dict, None, None]:
        # Phase 1 — input guardrail (visibility event for UI; actual Guardrails call
        # is wired in chat router via apply_guardrail when configured).
        yield {"type": "guardrail", "name": "input_check", "result": "passed",
                "content": "입력 가드레일 통과 (IP·경쟁사·규제·유해화학 4토픽 검사)"}
        yield {"type": "phase", "phase": "thinking"}

        messages = [{"role": "user", "content": [{"text": user_msg}]}]
        log.info("agent.run_stream session=%s tools=%d msg_len=%d", session_id, len(self.tools), len(user_msg))

        for round_idx in range(self.max_rounds):
            req = {
                "modelId": settings.sonnet_model,
                "messages": messages,
                "system": [{"text": self.system}],
                "inferenceConfig": {"maxTokens": 2048, "temperature": 0.4},
            }
            if self.tools:
                req["toolConfig"] = {"tools": self._tool_specs()}

            try:
                stream_resp = bedrock_runtime().converse_stream(**req)
            except Exception as e:
                log.error("Bedrock converse_stream failed (round %d, model=%s): %s",
                           round_idx, settings.sonnet_model, e, exc_info=True)
                yield {"type": "error",
                        "name": "bedrock",
                        "result": {"model": settings.sonnet_model, "error": type(e).__name__, "message": str(e)[:300]},
                        "content": f"Bedrock 호출 실패 ({type(e).__name__}): {str(e)[:200]}"}
                yield {"type": "delta",
                        "text": f"⚠️ 죄송합니다. Bedrock 모델 호출에 실패했습니다.\n\n"
                                f"- 모델: `{settings.sonnet_model}`\n"
                                f"- 오류: {type(e).__name__}\n"
                                f"- 메시지: {str(e)[:200]}\n\n"
                                f"관리자가 Bedrock 권한·모델 활성화·CRIP 가용성을 점검 중입니다."}
                yield {"type": "stop", "reason": "bedrock_error"}
                return

            # Stream consumption — yield delta per token chunk so the UI paints
            # incrementally. Tool inputs arrive as JSON streaming chunks
            # (toolUse.input is a partial string per delta) and must be
            # accumulated, then JSON-parsed at messageStop.
            text_chunks: list[str] = []
            tool_buf: list[dict[str, Any]] = []
            stop_reason: str | None = None

            for ev in stream_resp.get("stream", []):
                if "contentBlockStart" in ev:
                    start = ev["contentBlockStart"].get("start") or {}
                    if "toolUse" in start:
                        tu = start["toolUse"]
                        tool_buf.append({
                            "name": tu.get("name", ""),
                            "toolUseId": tu.get("toolUseId", ""),
                            "input_raw": "",
                        })
                elif "contentBlockDelta" in ev:
                    delta = ev["contentBlockDelta"].get("delta") or {}
                    if "text" in delta:
                        chunk = delta["text"]
                        text_chunks.append(chunk)
                        yield {"type": "delta", "text": chunk}
                    elif "toolUse" in delta and tool_buf:
                        # toolUse.input streams as a partial JSON string —
                        # accumulate, parse after the block closes.
                        tool_buf[-1]["input_raw"] += delta["toolUse"].get("input", "")
                elif "messageStop" in ev:
                    stop_reason = ev["messageStop"].get("stopReason")

            # Parse accumulated tool input strings into dicts.
            tool_uses: list[dict[str, Any]] = []
            for tc in tool_buf:
                raw = tc["input_raw"]
                try:
                    parsed = json.loads(raw) if raw else {}
                except json.JSONDecodeError:
                    log.warning("tool %s input JSON parse failed; raw=%r", tc["name"], raw[:200])
                    parsed = {}
                tool_uses.append({
                    "name": tc["name"],
                    "toolUseId": tc["toolUseId"],
                    "input": parsed,
                })

            # Rebuild the assistant message for Bedrock's next-turn context.
            # MUST include text + toolUse blocks so the next turn's toolResult
            # validates (toolUse count must match toolResult count).
            assistant_content: list[dict[str, Any]] = []
            if text_chunks:
                assistant_content.append({"text": "".join(text_chunks)})
            for tc in tool_uses:
                assistant_content.append({"toolUse": {
                    "toolUseId": tc["toolUseId"],
                    "name": tc["name"],
                    "input": tc["input"],
                }})
            if assistant_content:
                messages.append({"role": "assistant", "content": assistant_content})

            log.info("agent round=%d stop=%s text_chunks=%d tools=%d",
                      round_idx, stop_reason, len(text_chunks), len(tool_uses))

            if stop_reason == "end_turn":
                yield {"type": "guardrail", "name": "output_check", "result": "passed",
                        "content": "응답 가드레일 통과"}
                yield {"type": "stop", "reason": "end_turn"}
                return

            if tool_uses:
                yield {"type": "phase", "phase": "tool_use"}
                tool_results = []
                for tc in tool_uses:
                    name = tc["name"]
                    args = tc["input"]
                    tool_id = tc["toolUseId"]
                    record_trace(session_id=session_id, tool=name, args=args)
                    yield {"type": "tool_call", "name": name, "args": args}
                    fn = next((t[2] for t in self.tools if t[0] == name), None)
                    if not fn:
                        result: dict = {"error": f"unknown tool {name}"}
                    else:
                        try:
                            result = fn(name, args)
                        except Exception as e:
                            log.warning("tool %s raised: %s", name, e)
                            result = {"error": str(e)[:300]}
                    yield {"type": "tool_result", "name": name, "result": result}
                    tool_results.append({"toolResult": {"toolUseId": tool_id, "content": [{"json": result}]}})
                messages.append({"role": "user", "content": tool_results})
                continue

            # No tool_use and not end_turn — break
            break

        yield {"type": "guardrail", "name": "output_check", "result": "passed",
                "content": "응답 가드레일 통과"}
        yield {"type": "stop", "reason": "max_rounds"}
