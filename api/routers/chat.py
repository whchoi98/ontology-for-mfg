"""Scenario B — Conversational Agent (SSE stream)."""
from __future__ import annotations
import json
from fastapi import APIRouter, Body
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from api.services.agent import AgentRunner
from api.services.search import get_search
from api.services.neptune import get_neptune
from api.services.kb import retrieve_kb
from api.services.compliance_engine import check_component
from api.services.memory import save_fact

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    msg: str
    session_id: str
    persona: str = "engineer"


def _tool_search(_name: str, args: dict) -> dict:
    hits = get_search().hybrid_search(args.get("q", ""), top_n=5)
    return {"hits": [{"id": h["_id"], "name": h["_source"].get("name")} for h in hits]}


def _tool_neptune(_name: str, args: dict) -> dict:
    return {"results": get_neptune().run_cypher(args.get("cypher", ""), args.get("params", {}))}


def _tool_kb(_name: str, args: dict) -> dict:
    return {"results": retrieve_kb(args.get("q", ""), top_k=args.get("top_k", 5))}


def _tool_compliance(_name: str, args: dict) -> dict:
    from data.schemas import Component
    comp = Component(id=args.get("component_id", "?"), name="x", category="IC",
                     substances=args.get("substances", []))
    return check_component(comp)


def _tool_memory(_name: str, args: dict) -> dict:
    save_fact(session_id=args.get("session_id", "?"), key=args.get("key", "?"),
              value=args.get("value", "?"))
    return {"ok": True}


_TOOLS = [
    ("search_semantic", "Hybrid Korean+vector search over BOM/components", _tool_search),
    ("neptune_query",   "Run an openCypher query on the mfg graph", _tool_neptune),
    ("kb_retrieve",     "Retrieve from Bedrock Knowledge Base", _tool_kb),
    ("compliance_check", "Check a component against REACH/RoHS/AEC-Q rules", _tool_compliance),
    ("memory_save",     "Persist a user fact for future conversations", _tool_memory),
]


@router.post("/chat")
def chat(req: ChatRequest = Body(...)):
    runner = AgentRunner(tools=_TOOLS,
                         system=f"You are an AMZN Tech {req.persona} copilot. Korean + technical English.")

    def gen():
        for event in runner.run_stream(req.msg, session_id=req.session_id):
            yield {"event": event["type"], "data": json.dumps(event)}
    return EventSourceResponse(gen())
