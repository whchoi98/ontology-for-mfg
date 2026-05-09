# api/services/eight_d_writer.py
"""8D report writer — Bedrock Converse with tool-use forces all 8 sections.

Uses the same converse() path as the chat agent (which is proven to work via
SSE smoke tests), instead of legacy invoke_model + tool_choice. converse has
native tool support across CRIP profiles for Sonnet 4.6.
"""
from __future__ import annotations
import logging
from api.aws_clients import bedrock_runtime
from api.config import settings

log = logging.getLogger("mfg.eight_d_writer")

_TOOL_INPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "d1_team":        {"type": "string", "description": "Team formation — cross-functional 4-6 명"},
        "d2_problem":     {"type": "string", "description": "Problem statement with 5W1H + ppm/severity numbers"},
        "d3_containment": {"type": "string", "description": "Interim containment — quarantine, ship hold, AQL stricten"},
        "d4_root_cause":  {"type": "string", "description": "Root cause analysis — 5-Why or Ishikawa, cite specific drift"},
        "d5_corrective":  {"type": "string", "description": "Permanent corrective action — process change, qualification"},
        "d6_implemented": {"type": "string", "description": "Implementation — line/changeover schedule, monitoring window"},
        "d7_prevention":  {"type": "string", "description": "Prevent recurrence — SPC chart, poka-yoke, supplier audit"},
        "d8_closure":     {"type": "string", "description": "Closure — verification criteria, lessons learned, recognition"},
    },
    "required": ["d1_team", "d2_problem", "d3_containment", "d4_root_cause",
                 "d5_corrective", "d6_implemented", "d7_prevention", "d8_closure"],
}


def draft_eight_d(*, incident_title: str, incident_desc: str = "",
                   similar_reports: list[str] | None = None,
                   standards: list[str] | None = None) -> dict:
    """Return a dict with all 8 D-section keys. Raises on Bedrock failure (caller falls back)."""
    similar = "\n".join(similar_reports or [])
    stds = ", ".join(standards or [])
    user_text = (
        f"## Incident\n{incident_title}\n{incident_desc}\n\n"
        f"## Similar past 8D reports (KB)\n{similar or '(none)'}\n\n"
        f"## Applicable standards\n{stds or '(none)'}\n\n"
        "Draft a complete 8D report following AIAG 8D methodology. "
        "Each section must be a self-contained Korean technical paragraph (1-3 문장), "
        "with concrete numbers (ppm, °C, RH%, lot id) where relevant. "
        "Call the `emit_eight_d` tool exactly once with all 8 fields populated."
    )

    # 8D is structured output — eight required string fields enforced by the
    # tool schema. Haiku 4.5 produces this shape reliably and 2.5–3× faster
    # than Sonnet, comfortably under the 25s in-process budget. maxTokens
    # capped at 1500 since each section is 1–3 Korean sentences (~120 tokens
    # × 8 = ~960, plus headroom). This change is the difference between
    # "fallback every call" and "real LLM result every call".
    model_id = settings.haiku_model or settings.sonnet_model
    req = {
        "modelId": model_id,
        "messages": [{"role": "user", "content": [{"text": user_text}]}],
        "system": [{"text": "You are an automotive quality engineer writing AIAG-compliant 8D reports. "
                             "Each D-section is 1–3 Korean technical sentences with concrete numbers."}],
        "inferenceConfig": {"maxTokens": 1500, "temperature": 0.3},
        "toolConfig": {
            "tools": [{
                "toolSpec": {
                    "name": "emit_eight_d",
                    "description": "Emit a complete 8D report with all 8 sections.",
                    "inputSchema": {"json": _TOOL_INPUT_SCHEMA},
                }
            }],
            "toolChoice": {"tool": {"name": "emit_eight_d"}},
        },
    }

    log.info("eight_d converse → model=%s incident=%r", model_id, incident_title[:60])
    resp = bedrock_runtime().converse(**req)
    msg = resp.get("output", {}).get("message", {})
    for block in msg.get("content", []):
        tu = block.get("toolUse")
        if tu and tu.get("name") == "emit_eight_d":
            return tu.get("input") or {}
    raise RuntimeError(
        f"8D writer: no tool_use block in converse response (stop={resp.get('stopReason')!r})"
    )
