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
from collections.abc import Generator
from typing import Any

from api.aws_clients import bedrock_runtime
from api.config import settings
from api.services.guardrails import GuardrailVerdict
from api.services.guardrails import check as check_guardrail

log = logging.getLogger("mfg.agent")

# Claude Sonnet 5.5 thinks by default and thinking counts toward maxTokens.
_MAX_TOKENS = 8192
_GUARDRAIL_SCOPE_KO = "IP·경쟁사·규제·유해화학 4토픽 + 콘텐츠 필터"


def _open_block(blocks: list[dict[str, Any]], kind: str, idx: Any) -> dict[str, Any]:
    """The content block a delta belongs to; starts a new one on a kind/index change.
    Mocked streams omit contentBlockIndex — then consecutive same-kind deltas group."""
    if not blocks or blocks[-1]["kind"] != kind or blocks[-1]["idx"] != idx:
        blocks.append({"kind": kind, "idx": idx, "text": "", "signature": "", "redacted": b""})
    return blocks[-1]


def _run_guardrail(text: str, source: str) -> tuple[dict | None, GuardrailVerdict | None]:
    """Check `text` with the configured guardrail → (SSE event, verdict).

    ApplyGuardrail is called directly (not Converse `guardrailConfig`) so the input check
    covers the user's question only — Converse would re-screen tool results too, and a
    Neptune row listing SVHC substances must not trip HazardousChemical. On an API
    failure the check fails open with a `log` event — it never claims a pass.
    """
    if not settings.bedrock_guardrail_id:
        return None, None
    name = "input_check" if source == "INPUT" else "output_check"
    label = "입력" if source == "INPUT" else "응답"
    try:
        verdict = check_guardrail(text, source)
    except Exception as e:
        log.warning("guardrail %s check failed (fail-open): %s", name, e)
        return {
            "type": "log",
            "level": "warning",
            "message": f"{label} 가드레일 검사 실패 — 미적용 ({type(e).__name__})",
        }, None
    if verdict.blocked:
        log.warning("guardrail intervened: %s %s", name, ",".join(verdict.hits))
        return {
            "type": "guardrail",
            "name": name,
            "result": "blocked",
            "content": f"{label} 가드레일 차단: {', '.join(verdict.hits) or 'policy'}",
        }, verdict
    if verdict.detected:
        # 'detect'-mode topics (ai-stack.ts) — logged for /ops/guardrail tuning, never blocked.
        log.info("guardrail detected (monitor): %s %s", name, ",".join(verdict.detected))
        return {
            "type": "guardrail",
            "name": name,
            "result": "passed",
            "content": f"{label} 가드레일 통과 · 탐지(모니터링): {', '.join(verdict.detected)}",
        }, verdict
    return {
        "type": "guardrail",
        "name": name,
        "result": "passed",
        "content": f"{label} 가드레일 통과 ({_GUARDRAIL_SCOPE_KO})",
    }, verdict


# In-process ring buffer of recent tool_call events. Powers /api/ops/trace.
# Per-instance (not shared across ECS tasks) — adequate for the demo's
# diagnostic console; would need a backing store (DynamoDB/CloudWatch) for
# durable cross-instance traces.
_TRACE_MAX = 200
_TRACE_BUFFER: deque[dict] = deque(maxlen=_TRACE_MAX)

# Backstop for every tool result (tools may self-truncate more cleverly —
# see chat._tool_neptune). An unbounded result is echoed into the next
# converse_stream toolResult (ValidationException / context overflow) and
# into the SSE `tool_result` event.
MAX_TOOL_RESULT_BYTES = 40_000


def _bound_tool_result(name: str, result: Any) -> Any:
    """Return `result` unchanged when small; otherwise a truncated preview
    with an explicit marker the model can reason about."""
    try:
        encoded = json.dumps(result, ensure_ascii=False, default=str)
    except (TypeError, ValueError) as e:
        return {"error": f"tool result not serializable: {type(e).__name__}"}
    size = len(encoded.encode("utf-8"))
    if size <= MAX_TOOL_RESULT_BYTES:
        return result
    log.warning("tool %s result truncated: %d bytes > %d", name, size, MAX_TOOL_RESULT_BYTES)
    # Character slice, then trim until the UTF-8 encoding fits.
    preview = encoded[:MAX_TOOL_RESULT_BYTES]
    while len(preview.encode("utf-8")) > MAX_TOOL_RESULT_BYTES - 512:
        preview = preview[: int(len(preview) * 0.9)]
    return {
        "truncated": True,
        "original_bytes": size,
        "preview": preview,
        "note": "Tool result exceeded the size limit and was truncated; "
        "narrow the request (fewer rows / fields) if more detail is needed.",
    }


def record_trace(*, session_id: str, tool: str, args: dict, actor_id: str = "anonymous") -> None:
    """Append a tool-call event to the in-process trace ring."""
    _TRACE_BUFFER.append(
        {
            "ts": time.time(),
            "session_id": str(session_id or ""),
            "actor_id": str(actor_id or "anonymous"),
            "tool": str(tool or ""),
            "input": args if isinstance(args, dict) else {"_": args},
        }
    )


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

    def __init__(
        self,
        tools: list[tuple] | None = None,
        system: str = "You are a Korean Hi-Tech MFG copilot.",
        max_rounds: int = 8,
    ):
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
            out.append(
                {
                    "toolSpec": {
                        "name": tool[0],
                        "description": tool[1],
                        "inputSchema": {"json": schema},
                    }
                }
            )
        return out

    def _finish(self, answer: str, reason: str) -> Generator[dict, None, None]:
        """Output guardrail on the assistant's full answer, then `stop`.

        Checked after streaming so token-level deltas stay live (v0.5.6); a blocked
        answer is flagged and the stop reason says so."""
        event, verdict = _run_guardrail(answer, "OUTPUT") if answer.strip() else (None, None)
        if event:
            yield event
        if verdict and verdict.blocked:
            yield {
                "type": "delta",
                "text": "\n\n⚠️ " + (verdict.message or "이 응답은 정책에 따라 차단되었습니다."),
            }
            yield {"type": "stop", "reason": "guardrail_intervened"}
            return
        yield {"type": "stop", "reason": reason}

    def run_stream(self, user_msg: str, session_id: str) -> Generator[dict, None, None]:
        # Input guardrail — a blocked question never reaches the model.
        event, verdict = _run_guardrail(user_msg, "INPUT")
        if event:
            yield event
        if verdict and verdict.blocked:
            yield {
                "type": "delta",
                "text": verdict.message or "죄송합니다. 이 요청은 정책에 따라 응답할 수 없습니다.",
            }
            yield {"type": "stop", "reason": "guardrail_intervened"}
            return
        yield {"type": "phase", "phase": "thinking"}

        messages = [{"role": "user", "content": [{"text": user_msg}]}]
        answer_parts: list[str] = []  # every round's text — what the output guardrail checks
        log.info(
            "agent.run_stream session=%s tools=%d msg_len=%d",
            session_id,
            len(self.tools),
            len(user_msg),
        )

        for round_idx in range(self.max_rounds):
            req: dict[str, Any] = {
                "modelId": settings.sonnet_model,
                "messages": messages,
                "system": [{"text": self.system}],
                # No temperature: Claude Sonnet 5.5 rejects sampling parameters.
                "inferenceConfig": {"maxTokens": _MAX_TOKENS},
            }
            if settings.sonnet_effort:
                req["additionalModelRequestFields"] = {
                    "output_config": {"effort": settings.sonnet_effort}
                }
            if self.tools:
                req["toolConfig"] = {"tools": self._tool_specs()}

            try:
                stream_resp = bedrock_runtime().converse_stream(**req)
            except Exception as e:
                log.error(
                    "Bedrock converse_stream failed (round %d, model=%s): %s",
                    round_idx,
                    settings.sonnet_model,
                    e,
                    exc_info=True,
                )
                yield {
                    "type": "error",
                    "name": "bedrock",
                    "result": {
                        "model": settings.sonnet_model,
                        "error": type(e).__name__,
                        "message": str(e)[:300],
                    },
                    "content": f"Bedrock 호출 실패 ({type(e).__name__}): {str(e)[:200]}",
                }
                yield {
                    "type": "delta",
                    "text": f"⚠️ 죄송합니다. Bedrock 모델 호출에 실패했습니다.\n\n"
                    f"- 모델: `{settings.sonnet_model}`\n"
                    f"- 오류: {type(e).__name__}\n"
                    f"- 메시지: {str(e)[:200]}\n\n"
                    f"관리자가 Bedrock 권한·모델 활성화·CRIP 가용성을 점검 중입니다.",
                }
                yield {"type": "stop", "reason": "bedrock_error"}
                return

            # Stream consumption — yield delta per token chunk so the UI paints
            # incrementally. Content blocks (reasoning / text / toolUse) are
            # rebuilt in stream order: Claude 5.x thinking blocks must be passed
            # back unchanged, signature included, or later turns lose the
            # reasoning (and edited histories are rejected on newer accounts).
            # Tool inputs stream as partial JSON strings, parsed at the end.
            blocks: list[dict[str, Any]] = []
            stop_reason: str | None = None

            for ev in stream_resp.get("stream", []):
                if "contentBlockStart" in ev:
                    body = ev["contentBlockStart"]
                    start = body.get("start") or {}
                    if "toolUse" in start:
                        tu = start["toolUse"]
                        blocks.append(
                            {
                                "kind": "tool",
                                "idx": body.get("contentBlockIndex"),
                                "name": tu.get("name", ""),
                                "toolUseId": tu.get("toolUseId", ""),
                                "input_raw": "",
                            }
                        )
                elif "contentBlockDelta" in ev:
                    body = ev["contentBlockDelta"]
                    idx = body.get("contentBlockIndex")
                    delta = body.get("delta") or {}
                    if "text" in delta:
                        chunk = delta["text"]
                        _open_block(blocks, "text", idx)["text"] += chunk
                        yield {"type": "delta", "text": chunk}
                    elif "reasoningContent" in delta:
                        rc = delta["reasoningContent"]
                        b = _open_block(blocks, "reasoning", idx)
                        b["text"] += rc.get("text", "")
                        b["signature"] += rc.get("signature", "")
                        b["redacted"] += rc.get("redactedContent", b"")
                    elif "toolUse" in delta:
                        tb = next((b for b in reversed(blocks) if b["kind"] == "tool"), None)
                        if tb is not None:
                            tb["input_raw"] += delta["toolUse"].get("input", "")
                elif "messageStop" in ev:
                    stop_reason = ev["messageStop"].get("stopReason")

            # Rebuild the assistant message for Bedrock's next-turn context.
            # toolUse blocks MUST be present so the next turn's toolResult
            # validates (toolUse count must match toolResult count).
            tool_uses: list[dict[str, Any]] = []
            assistant_content: list[dict[str, Any]] = []
            round_text = ""
            for b in blocks:
                if b["kind"] == "reasoning":
                    if b["redacted"]:
                        assistant_content.append(
                            {"reasoningContent": {"redactedContent": b["redacted"]}}
                        )
                    elif b["signature"]:
                        assistant_content.append(
                            {
                                "reasoningContent": {
                                    "reasoningText": {
                                        "text": b["text"],
                                        "signature": b["signature"],
                                    }
                                }
                            }
                        )
                elif b["kind"] == "text":
                    if b["text"]:
                        round_text += b["text"]
                        assistant_content.append({"text": b["text"]})
                else:
                    raw = b["input_raw"]
                    try:
                        parsed = json.loads(raw) if raw else {}
                    except json.JSONDecodeError:
                        log.warning("tool %s input JSON parse failed; raw=%r", b["name"], raw[:200])
                        parsed = {}
                    tool_uses.append(
                        {"name": b["name"], "toolUseId": b["toolUseId"], "input": parsed}
                    )
                    assistant_content.append(
                        {
                            "toolUse": {
                                "toolUseId": b["toolUseId"],
                                "name": b["name"],
                                "input": parsed,
                            }
                        }
                    )
            if assistant_content:
                messages.append({"role": "assistant", "content": assistant_content})
            if round_text:
                answer_parts.append(round_text)

            log.info(
                "agent round=%d stop=%s blocks=%d tools=%d",
                round_idx,
                stop_reason,
                len(blocks),
                len(tool_uses),
            )

            if stop_reason == "end_turn":
                yield from self._finish("".join(answer_parts), "end_turn")
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
                    result = _bound_tool_result(name, result)
                    yield {"type": "tool_result", "name": name, "result": result}
                    tool_results.append(
                        {"toolResult": {"toolUseId": tool_id, "content": [{"json": result}]}}
                    )
                messages.append({"role": "user", "content": tool_results})
                continue

            # No tool_use and not end_turn (max_tokens, refusal, content filter …) —
            # finish with the real reason instead of pretending we ran out of rounds.
            yield from self._finish("".join(answer_parts), stop_reason or "unknown")
            return

        yield from self._finish("".join(answer_parts), "max_rounds")
