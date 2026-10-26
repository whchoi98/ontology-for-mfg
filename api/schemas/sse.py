"""SSE event payload schemas — single source of truth for the 9-event
vocabulary used by /chat, /eight-d, /insights, and the AgentRunner
tool-use loop.

Producer side (`api/services/agent.py`, `api/routers/eight_d.py`)
and consumer side (`web/lib/sse-events.ts`, hand-mirrored from this
file) both reference these models. Drift between producer-emitted
dict keys and consumer parsing was the implicit-coupling failure mode
flagged by the harness-eval design evaluator (0.4.0).

Keep models loose — emitters attach optional context fields the rubric
doesn't enumerate (e.g. `model_id`, `model_label` on the bedrock phase
event). `model_config = {"extra": "allow"}` keeps forward-compat.

Helper `as_event(...)` formats a model instance into the
`{"event": <type>, "data": <json>}` shape that sse-starlette's
`EventSourceResponse` expects. Use it everywhere events are yielded.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class _LooseEvent(BaseModel):
    """Base for every SSE event — type discriminator + extra=allow."""

    model_config = ConfigDict(extra="allow")
    type: str


# ─── Phase lifecycle ───────────────────────────────────────────────────────


class PhaseEvent(_LooseEvent):
    type: Literal["phase"] = "phase"
    phase: str
    label: str | None = None
    # eight-d carries `model_id` + `model_label` on the bedrock phase event
    # so the UI chip reflects the actual runtime model.
    model_id: str | None = None
    model_label: str | None = None


class PhaseDoneEvent(_LooseEvent):
    type: Literal["phase_done"] = "phase_done"
    phase: str
    duration_s: float | None = None
    detail: str | None = None


# ─── Streaming output ──────────────────────────────────────────────────────


class DeltaEvent(_LooseEvent):
    """Token / chunk of streamed assistant text."""

    type: Literal["delta"] = "delta"
    text: str


# ─── Tool use ──────────────────────────────────────────────────────────────


class ToolCallEvent(_LooseEvent):
    type: Literal["tool_call"] = "tool_call"
    name: str
    args: dict[str, Any] = Field(default_factory=dict)


class ToolResultEvent(_LooseEvent):
    type: Literal["tool_result"] = "tool_result"
    name: str
    result: Any


# ─── Guardrail / log / error ───────────────────────────────────────────────


class GuardrailEvent(_LooseEvent):
    type: Literal["guardrail"] = "guardrail"
    name: str
    result: Literal["passed", "blocked"]
    content: str | None = None


class LogEvent(_LooseEvent):
    type: Literal["log"] = "log"
    level: str | None = None
    message: str


class ErrorEvent(_LooseEvent):
    type: Literal["error"] = "error"
    name: str | None = None
    result: dict[str, Any] | None = None
    content: str | None = None


# ─── Final result + stop ───────────────────────────────────────────────────


class ResultEvent(_LooseEvent):
    """Terminal payload for /eight-d (and /insights) — full markdown +
    sections + metadata. Chat does not emit this; chat ends with stop."""

    type: Literal["result"] = "result"
    markdown: str | None = None
    sections: list[dict[str, Any]] | None = None
    incident: dict[str, Any] | None = None
    similar_count: int | None = None
    fallback: bool | None = None
    synthetic: bool | None = None
    total_s: float | None = None


class StopEvent(_LooseEvent):
    type: Literal["stop"] = "stop"
    reason: str | None = None


class SuggestedFollowupsEvent(_LooseEvent):
    """3 short Korean follow-up questions appended right before /chat's stop
    event. The web UI renders these as clickable chips that send the picked
    question as the next user turn. See api/services/followups.py."""

    type: Literal["suggested_followups"] = "suggested_followups"
    items: list[str] = Field(default_factory=list)


# Union for type-checking emit functions
SseEvent = (
    PhaseEvent
    | PhaseDoneEvent
    | DeltaEvent
    | ToolCallEvent
    | ToolResultEvent
    | GuardrailEvent
    | LogEvent
    | ErrorEvent
    | ResultEvent
    | StopEvent
    | SuggestedFollowupsEvent
)


def as_event(payload: BaseModel | dict[str, Any]) -> dict[str, str]:
    """Serialize an SSE payload into sse-starlette's `{event, data}` shape.

    Accepts either a Pydantic model instance or a raw dict (for migration
    convenience while routers transition to typed events). The `event`
    name is always the value of the `type` field.
    """
    if isinstance(payload, BaseModel):
        d = payload.model_dump(exclude_none=True)
    else:
        d = dict(payload)
    return {
        "event": d.get("type", "message"),
        "data": json.dumps(d, ensure_ascii=False),
    }
