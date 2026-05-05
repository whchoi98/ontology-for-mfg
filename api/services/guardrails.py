# api/services/guardrails.py
"""Bedrock Guardrails — apply to LLM input or output."""
from __future__ import annotations
from typing import Literal
from api.aws_clients import bedrock_runtime
from api.config import settings


def apply_guardrail(text: str, guardrail_id: str | None = None,
                     source: Literal["INPUT", "OUTPUT"] = "OUTPUT",
                     guardrail_version: str = "DRAFT") -> dict:
    gid = guardrail_id or settings.bedrock_guardrail_id
    resp = bedrock_runtime().apply_guardrail(
        guardrailIdentifier=gid,
        guardrailVersion=guardrail_version,
        source=source,
        content=[{"text": {"text": text}}],
    )
    return resp
