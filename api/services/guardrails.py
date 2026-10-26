# api/services/guardrails.py
"""Bedrock Guardrails — apply to LLM input or output."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from api.aws_clients import bedrock_runtime
from api.config import settings

# ApplyGuardrail bills per 1k-char text unit; chat answers stay well under this.
_MAX_CHECK_CHARS = 20_000


@dataclass(frozen=True)
class GuardrailVerdict:
    blocked: bool
    hits: tuple[str, ...] = ()  # blocking topic names / content-filter types
    message: str = ""  # the guardrail's configured blocked-messaging text
    detected: tuple[str, ...] = ()  # 'detect'-mode policies that matched (action NONE)


def apply_guardrail(
    text: str,
    guardrail_id: str | None = None,
    source: Literal["INPUT", "OUTPUT"] = "OUTPUT",
    guardrail_version: str = "DRAFT",
) -> dict:
    gid = guardrail_id or settings.bedrock_guardrail_id
    resp = bedrock_runtime().apply_guardrail(
        guardrailIdentifier=gid,
        guardrailVersion=guardrail_version,
        source=source,
        content=[{"text": {"text": text}}],
    )
    return resp


def check(text: str, source: Literal["INPUT", "OUTPUT"]) -> GuardrailVerdict:
    """Run the configured guardrail on `text`; raises on API failure (caller decides)."""
    resp = apply_guardrail(
        text[:_MAX_CHECK_CHARS], source=source, guardrail_version=settings.bedrock_guardrail_version
    )
    hits: list[str] = []
    detected: list[str] = []
    for a in resp.get("assessments", []):
        policies = [
            (t["name"], t.get("action", "BLOCKED"))
            for t in a.get("topicPolicy", {}).get("topics", [])
        ]
        policies += [
            (f["type"], f.get("action", "BLOCKED"))
            for f in a.get("contentPolicy", {}).get("filters", [])
        ]
        for name, action in policies:
            (hits if action == "BLOCKED" else detected).append(name)
    if resp.get("action") != "GUARDRAIL_INTERVENED":
        return GuardrailVerdict(blocked=False, detected=tuple(dict.fromkeys(detected)))
    message = next((o["text"] for o in resp.get("outputs", []) if o.get("text")), "")
    return GuardrailVerdict(
        blocked=True,
        hits=tuple(dict.fromkeys(hits)),
        message=message,
        detected=tuple(dict.fromkeys(detected)),
    )
