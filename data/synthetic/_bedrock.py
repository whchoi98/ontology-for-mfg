"""Bedrock helper for LLM-assisted synthetic data generation.

Mirrors retail's `data/synthetic/_bedrock.py` pattern. Uses Anthropic's tool-use
to enforce structured array output, parsed back into pydantic models by callers.
"""
from __future__ import annotations
import json
import os
from typing import Any
import boto3


def array_tool_schema(name: str, description: str, item_schema: dict) -> dict:
    """Build a tool schema that emits a JSON array. Caller defines `item_schema` (per-item shape)."""
    return {
        "name": name,
        "description": description,
        "input_schema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": item_schema,
                },
            },
            "required": ["items"],
        },
    }


def call_with_tool(
    *,
    model_id: str,
    system: str,
    user: str,
    tool: dict,
    region: str = "ap-northeast-2",
    max_tokens: int = 4096,
    temperature: float = 0.4,
) -> list[dict]:
    """Invoke Bedrock with anthropic-style tool-use. Returns the `items` array from the tool input.

    Caller is responsible for validating each item with their pydantic schema and retrying on
    pydantic ValidationError (typically by reducing batch size).
    """
    client = boto3.client("bedrock-runtime", region_name=region)
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "tools": [tool],
        "tool_choice": {"type": "tool", "name": tool["name"]},
    })
    resp = client.invoke_model(modelId=model_id, body=body)
    payload = json.loads(resp["body"].read())
    for block in payload.get("content", []):
        if block.get("type") == "tool_use":
            return block["input"]["items"]
    return []


DEFAULT_SONNET = os.environ.get("MFG_SONNET_MODEL_ID", "anthropic.claude-sonnet-4-6-v1:0")
DEFAULT_HAIKU = os.environ.get("MFG_HAIKU_MODEL_ID", "anthropic.claude-haiku-4-5-20251001-v1:0")
