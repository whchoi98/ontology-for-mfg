"""Scenario B — Conversational Agent (SSE stream)."""
from __future__ import annotations
import logging
import re
from fastapi import APIRouter, Body
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from api.schemas.sse import as_event
from api.services.agent import AgentRunner
from api.services.search import get_search
from api.services.neptune import get_neptune
from api.services.kb import retrieve_kb
from api.services.compliance_engine import check_component
from api.services.memory import save_fact

router = APIRouter(tags=["chat"])
log = logging.getLogger("mfg.chat")


class ChatRequest(BaseModel):
    msg: str
    session_id: str
    persona: str = "engineer"


def _tool_search(_name: str, args: dict) -> dict:
    hits = get_search().hybrid_search(args.get("q", ""), top_n=5)
    return {"hits": [{"id": h["_id"], "name": h["_source"].get("name")} for h in hits]}


# Deterministic deny-list of Cypher write/destructive clauses + dangerous
# procedure namespaces. Defense-in-depth against LLM prompt-injection — the
# system prompt and Bedrock Guardrails are probabilistic; this is not.
# `\b` word boundaries + IGNORECASE catch case mixing; the COMPILE constants
# keep the hot-path cheap.
_CYPHER_WRITE_PATTERN = re.compile(
    r"\b("
    r"CREATE|DELETE|DETACH\s+DELETE|SET|REMOVE|MERGE|DROP|"
    r"FOREACH|LOAD\s+CSV|USING\s+PERIODIC\s+COMMIT|"
    r"CALL\s+db\.|CALL\s+dbms\.|CALL\s+apoc\.(?!coll|convert|map|meta|text|util)"
    r")\b",
    re.IGNORECASE,
)


def _tool_neptune(_name: str, args: dict) -> dict:
    """Read-only openCypher gateway.

    The LLM may *generate* Cypher, but only MATCH / WITH / RETURN / UNWIND /
    OPTIONAL MATCH / read-procedure CALLs are allowed to *execute*. Any
    write or destructive clause short-circuits to an error result that the
    agent can use to course-correct, instead of touching the graph.
    """
    cypher = (args.get("cypher") or "").strip()
    if not cypher:
        return {"error": "empty cypher"}
    m = _CYPHER_WRITE_PATTERN.search(cypher)
    if m:
        log.warning("neptune tool blocked write clause %r in cypher=%r",
                     m.group(0), cypher[:200])
        return {
            "error": "read-only mode: write/destructive Cypher rejected",
            "blocked_clause": m.group(0).upper(),
            "rejected_query": cypher[:200],
            "hint": "Re-issue using only MATCH / WITH / RETURN / UNWIND / OPTIONAL MATCH.",
        }
    params = args.get("params") or {}
    if not isinstance(params, dict):
        params = {}
    return {"results": get_neptune().run_cypher(cypher, params)}


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


# Tool definitions with explicit inputSchema (so Bedrock fills required fields).
# Tuple shape: (name, description, fn, input_schema)
_TOOLS = [
    (
        "search_semantic",
        "Hybrid Korean+vector search over BOM/components/standards. Returns top-N hits.",
        _tool_search,
        {
            "type": "object",
            "properties": {
                "q": {"type": "string", "description": "Korean or English natural-language query, ≥3 chars (e.g. 'AEC-Q100 BGA package')"},
                "top_n": {"type": "integer", "description": "max hits to return (default 5)"},
            },
            "required": ["q"],
        },
    ),
    (
        "neptune_query",
        "Run an openCypher query on the mfg knowledge graph (22 classes — Component/Supplier/Plant/TradeLane/Standard/etc.).",
        _tool_neptune,
        {
            "type": "object",
            "properties": {
                "cypher": {"type": "string", "description": "Full openCypher query, e.g. 'MATCH (c:Component {id: $id}) RETURN c LIMIT 1'. Must NOT be empty."},
                "params": {"type": "object", "description": "Optional Cypher parameters keyed by $name", "additionalProperties": True},
            },
            "required": ["cypher"],
        },
    ),
    (
        "kb_retrieve",
        "Retrieve passages from Bedrock Knowledge Base — datasheets, 8D reports, certifications, regulatory guidance.",
        _tool_kb,
        {
            "type": "object",
            "properties": {
                "q": {"type": "string", "description": "Natural-language query for the KB"},
                "top_k": {"type": "integer", "description": "number of passages to retrieve (1-10, default 5)"},
            },
            "required": ["q"],
        },
    ),
    (
        "compliance_check",
        "Check a component against REACH-SVHC, RoHS, AEC-Q rules. Returns {compliant, violations[]}.",
        _tool_compliance,
        {
            "type": "object",
            "properties": {
                "component_id": {"type": "string", "description": "Component id (e.g. AMZN-CMP-IC-00001)"},
                "substances": {"type": "array", "items": {"type": "string"}, "description": "Optional CAS-IDs to check explicitly"},
            },
            "required": ["component_id"],
        },
    ),
    (
        "memory_save",
        "Persist a user fact for future conversations (e.g. 'prefers Tier-1 supplier X', 'budget cap 5M USD').",
        _tool_memory,
        {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "key":        {"type": "string", "description": "Fact key (e.g. 'preference', 'constraint')"},
                "value":      {"type": "string", "description": "Fact value"},
            },
            "required": ["key", "value"],
        },
    ),
]


_SYSTEM_PROMPT_TEMPLATE = (
    "You are an AMZN Tech {persona} copilot for a hi-tech manufacturing knowledge graph. "
    "Domain: 가전 H&A / TV HE / 자동차 전장 VS / 부품 Innotek+Magna ePT JV. "
    "Always respond in Korean (technical English terms OK). "
    "When you need data:\n"
    "  • Use `search_semantic(q)` for fuzzy concept search (e.g. '차량용 -40°C BGA').\n"
    "  • Use `neptune_query(cypher, params)` for precise BOM/Supplier/Plant/Lane lookups — "
    "ALWAYS supply a complete openCypher string. **READ-ONLY ONLY**: only "
    "MATCH / OPTIONAL MATCH / WITH / RETURN / UNWIND. Never CREATE / DELETE / "
    "SET / REMOVE / MERGE / DROP — the gateway will reject those.\n"
    "  • Use `kb_retrieve(q)` for datasheet / 8D / regulation context.\n"
    "  • Use `compliance_check(component_id)` for REACH/RoHS/AEC-Q verification.\n"
    "Never call a tool with empty arguments — every tool requires the listed `required` fields. "
    "If a tool result is empty or errors out, acknowledge briefly and proceed without retrying the same call. "
    "Format output as Markdown when listing items (tables, bullets, **bold** for IDs)."
)


@router.post("/chat")
def chat(req: ChatRequest = Body(...)):
    runner = AgentRunner(
        tools=_TOOLS,
        system=_SYSTEM_PROMPT_TEMPLATE.format(persona=req.persona),
    )

    def gen():
        for event in runner.run_stream(req.msg, session_id=req.session_id):
            yield as_event(event)
    return EventSourceResponse(gen())
