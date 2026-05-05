# api/services/eight_d_writer.py
"""8D report writer -- Claude tool-use enforces all 8 sections (D1-D8)."""
from __future__ import annotations
import json
from api.aws_clients import bedrock_runtime
from api.config import settings


_TOOL_SCHEMA = {
    "name": "emit_eight_d",
    "description": "Emit a complete 8D report with all 8 sections.",
    "input_schema": {
        "type": "object",
        "properties": {
            "d1_team": {"type": "string", "description": "Team formation"},
            "d2_problem": {"type": "string", "description": "Problem statement"},
            "d3_containment": {"type": "string", "description": "Interim containment"},
            "d4_root_cause": {"type": "string", "description": "Root cause analysis (5-Why or Ishikawa)"},
            "d5_corrective": {"type": "string", "description": "Permanent corrective action"},
            "d6_implemented": {"type": "string", "description": "Implementation details"},
            "d7_prevention": {"type": "string", "description": "Prevent recurrence (SPC, poka-yoke)"},
            "d8_closure": {"type": "string", "description": "Team recognition and closure"},
        },
        "required": ["d1_team", "d2_problem", "d3_containment", "d4_root_cause",
                     "d5_corrective", "d6_implemented", "d7_prevention", "d8_closure"],
    },
}


def draft_eight_d(*, incident_title: str, incident_desc: str = "",
                   similar_reports: list[str] | None = None,
                   standards: list[str] | None = None) -> dict:
    similar = "\n".join(similar_reports or [])
    stds = ", ".join(standards or [])
    user = (
        f"## Incident\n{incident_title}\n{incident_desc}\n\n"
        f"## Similar past 8D reports\n{similar}\n\n"
        f"## Applicable standards\n{stds}\n\n"
        "Draft a complete 8D report following the AIAG 8D methodology."
    )
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 3000,
        "system": "You are an automotive quality engineer writing AIAG-compliant 8D reports in Korean technical English.",
        "messages": [{"role": "user", "content": user}],
        "tools": [_TOOL_SCHEMA],
        "tool_choice": {"type": "tool", "name": "emit_eight_d"},
    })
    resp = bedrock_runtime().invoke_model(modelId=settings.sonnet_model, body=body)
    payload = json.loads(resp["body"].read())
    for block in payload.get("content", []):
        if block.get("type") == "tool_use":
            return block["input"]
    raise RuntimeError("8D writer: no tool_use block in response")
