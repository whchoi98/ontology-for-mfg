# api/services/agent.py
"""AgentCore-style tool-use orchestrator using Bedrock Converse API.

Streams 'phase / delta / tool_call / tool_result / log / stop' events compatible
with retail's SSE event vocabulary so the web frontend can render in real time.

Tool callback signature: (name: str, args: dict) -> dict (any JSON-serializable).
"""
from __future__ import annotations
from typing import Callable, Generator
from api.aws_clients import bedrock_runtime
from api.config import settings


class AgentRunner:
    def __init__(self, tools: list[tuple[str, str, Callable]] | None = None,
                 system: str = "You are a Korean Hi-Tech MFG copilot.",
                 max_rounds: int = 8):
        self.tools = tools or []
        self.system = system
        self.max_rounds = max_rounds

    def _tool_specs(self) -> list[dict]:
        return [{
            "toolSpec": {
                "name": name,
                "description": desc,
                "inputSchema": {"json": {"type": "object", "properties": {}, "additionalProperties": True}},
            }
        } for name, desc, _fn in self.tools]

    def run_stream(self, user_msg: str, session_id: str) -> Generator[dict, None, None]:
        messages = [{"role": "user", "content": [{"text": user_msg}]}]
        yield {"type": "phase", "phase": "thinking"}
        for round_idx in range(self.max_rounds):
            req = {
                "modelId": settings.sonnet_model,
                "messages": messages,
                "system": [{"text": self.system}],
                "inferenceConfig": {"maxTokens": 2048, "temperature": 0.4},
            }
            if self.tools:
                req["toolConfig"] = {"tools": self._tool_specs()}
            resp = bedrock_runtime().converse(**req)
            msg = resp["output"]["message"]
            content = msg.get("content", [])
            tool_uses = [c["toolUse"] for c in content if "toolUse" in c]
            text_blocks = [c["text"] for c in content if "text" in c]
            for t in text_blocks:
                yield {"type": "delta", "text": t}
            messages.append(msg)
            if resp.get("stopReason") == "end_turn":
                yield {"type": "stop", "reason": "end_turn"}
                return
            if tool_uses:
                yield {"type": "phase", "phase": "tool_use"}
                tool_results = []
                for tu in tool_uses:
                    name = tu["name"]
                    args = tu.get("input", {})
                    tool_id = tu["toolUseId"]
                    yield {"type": "tool_call", "name": name, "args": args}
                    fn = next((f for n, _d, f in self.tools if n == name), None)
                    if not fn:
                        result = {"error": f"unknown tool {name}"}
                    else:
                        try:
                            result = fn(name, args)
                        except Exception as e:
                            result = {"error": str(e)}
                    yield {"type": "tool_result", "name": name, "result": result}
                    tool_results.append({"toolResult": {"toolUseId": tool_id, "content": [{"json": result}]}})
                messages.append({"role": "user", "content": tool_results})
                continue
            break
        yield {"type": "stop", "reason": "max_rounds"}
