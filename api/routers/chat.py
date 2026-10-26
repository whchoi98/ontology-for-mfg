"""Scenario B — Conversational Agent (SSE stream)."""

from __future__ import annotations

import json
import logging
import re

from fastapi import APIRouter, Body
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from api.routers.compliance import evaluate_component
from api.schemas.sse import as_event
from api.services.agent import AgentRunner
from api.services.followups import generate as generate_followups
from api.services.kb import retrieve_kb
from api.services.memory import save_fact
from api.services.neptune import get_neptune
from api.services.search import get_search
from ontology import registry

router = APIRouter(tags=["chat"])
log = logging.getLogger("mfg.chat")


class ChatRequest(BaseModel):
    msg: str
    session_id: str
    persona: str = "engineer"


def _tool_search(_name: str, args: dict) -> dict:
    try:
        top_n = max(1, min(int(args.get("top_n") or 5), 10))
    except (TypeError, ValueError):
        top_n = 5
    hits = get_search().hybrid_search(args.get("q", ""), top_n=top_n)
    out = []
    for h in hits:
        src = h.get("_source") or {}
        # AOSS auto-assigns `_id`; the application id (what Neptune's
        # `{id: ...}` matches) lives in `_source.id`.
        out.append(
            {
                "id": src.get("id") or h.get("_id"),
                "name": src.get("name"),
                "label": src.get("label"),
            }
        )
    return {"hits": out}


# Deterministic deny-list of Cypher write/destructive clauses + dangerous
# procedure namespaces. Defense-in-depth against LLM prompt-injection — the
# system prompt and Bedrock Guardrails are probabilistic; this is not.
# `\b` word boundaries + IGNORECASE catch case mixing; the COMPILE constants
# keep the hot-path cheap. `_tool_neptune` also runs it over a comment- and
# backtick-stripped copy so LOAD/**/CSV or CALL `db`.x() can't split a
# multi-word clause.
_CYPHER_WRITE_PATTERN = re.compile(
    r"\b("
    r"CREATE|DELETE|DETACH\s+DELETE|SET|REMOVE|MERGE|DROP|"
    r"FOREACH|LOAD\s+CSV|USING\s+PERIODIC\s+COMMIT|"
    r"CALL\s+db\.|CALL\s+dbms\.|CALL\s+apoc\.(?!coll|convert|map|meta|text|util)"
    r")\b",
    re.IGNORECASE,
)


# Cost cap for LLM-generated reads. `MATCH (t:Telemetry) RETURN t` would
# otherwise pull thousands of nodes into the Bedrock toolResult (next-turn
# ValidationException / context blow-up) and the SSE tool_result event.
_NEPTUNE_MAX_ROWS = 100
_TOOL_RESULT_MAX_BYTES = 32_000
_TRAILING_LIMIT = re.compile(
    r"\bLIMIT\s+(\d+|\$[A-Za-z_][A-Za-z0-9_]*)\s*$",
    re.IGNORECASE,
)


def _strip_cypher_comments(cypher: str, *, drop_backticks: bool = False) -> str:
    """Replace `//` and `/* */` comments with a space, honouring string
    literals and backtick identifiers.

    Cypher treats comments as whitespace, so `LOAD/**/CSV` or
    `CALL/**/db.labels()` execute but slip past a whitespace-only regex. The deny-list
    therefore also runs on this normalised form (with backticks dropped so
    `` CALL `db`.labels() `` normalises to `CALL db.labels()`). String
    contents are kept verbatim — a keyword inside a literal stays visible
    (false positive at worst, never a false negative).
    """
    out: list[str] = []
    i, n = 0, len(cypher)
    quote: str | None = None
    while i < n:
        ch = cypher[i]
        if quote:
            if ch == "\\" and quote != "`" and i + 1 < n:
                out.append(cypher[i : i + 2])
                i += 2
                continue
            if ch == quote:
                quote = None
                if ch == "`" and drop_backticks:
                    i += 1
                    continue
            out.append(ch)
            i += 1
            continue
        if ch in ("'", '"', "`"):
            quote = ch
            if not (ch == "`" and drop_backticks):
                out.append(ch)
            i += 1
            continue
        if cypher.startswith("//", i):
            j = cypher.find("\n", i)
            i = n if j == -1 else j  # keep the newline itself
            out.append(" ")
            continue
        if cypher.startswith("/*", i):
            j = cypher.find("*/", i + 2)
            i = n if j == -1 else j + 2
            out.append(" ")
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _cap_rows(cypher: str) -> str:
    """Append `LIMIT _NEPTUNE_MAX_ROWS` or clamp a larger trailing LIMIT.

    Expects comment-free input (so the appended clause can't land inside a
    trailing `//` comment). A trailing `LIMIT $param` is replaced by the
    literal cap — the param may be reused elsewhere, so it isn't rewritten.
    UNION / non-literal limits are still bounded by the post-hoc slice in
    `_truncate_rows`.
    """
    q = cypher.rstrip().rstrip(";").rstrip()
    m = _TRAILING_LIMIT.search(q)
    if not m:
        return f"{q}\nLIMIT {_NEPTUNE_MAX_ROWS}"
    token = m.group(1)
    if token.startswith("$") or int(token) > _NEPTUNE_MAX_ROWS:
        return f"{q[:m.start(1)]}{_NEPTUNE_MAX_ROWS}{q[m.end(1):]}"
    return q


def _truncate_rows(rows: list) -> dict:
    """Bound the tool result by row count and serialized size, with an
    explicit marker so the model knows it is looking at a partial answer."""
    total = len(rows)
    kept: list = []
    used = 0
    truncated = total > _NEPTUNE_MAX_ROWS
    for row in rows[:_NEPTUNE_MAX_ROWS]:
        size = len(json.dumps(row, ensure_ascii=False, default=str).encode("utf-8")) + 1
        if used + size > _TOOL_RESULT_MAX_BYTES:
            truncated = True
            break
        kept.append(row)
        used += size
    out: dict = {"results": kept, "row_count": len(kept)}
    if truncated:
        out["truncated"] = True
        out["rows_returned_by_db"] = total
        out["note"] = (
            f"결과가 {total}행 중 {len(kept)}행으로 잘렸습니다 "
            f"(최대 {_NEPTUNE_MAX_ROWS}행 / {_TOOL_RESULT_MAX_BYTES // 1000}KB). "
            "필요한 속성만 RETURN 하거나 집계(count/collect)·LIMIT 으로 범위를 좁혀 다시 질의하세요."
        )
    return out


def _tool_neptune(_name: str, args: dict) -> dict:
    """Read-only openCypher gateway.

    The LLM may *generate* Cypher, but only MATCH / WITH / RETURN / UNWIND /
    OPTIONAL MATCH / read-procedure CALLs are allowed to *execute*. Any
    write or destructive clause short-circuits to an error result that the
    agent can use to course-correct, instead of touching the graph.
    Accepted reads are row-capped (LIMIT append/clamp) and the serialized
    result is truncated — see `_cap_rows` / `_truncate_rows`.
    """
    cypher = (args.get("cypher") or "").strip()
    if not cypher:
        return {"error": "empty cypher"}
    # Deny-list on the raw text AND on the comment/backtick-normalised form.
    m = _CYPHER_WRITE_PATTERN.search(cypher) or _CYPHER_WRITE_PATTERN.search(
        _strip_cypher_comments(cypher, drop_backticks=True)
    )
    if m:
        log.warning("neptune tool blocked write clause %r in cypher=%r", m.group(0), cypher[:200])
        return {
            "error": "read-only mode: write/destructive Cypher rejected",
            "blocked_clause": " ".join(m.group(0).upper().split()),
            "rejected_query": cypher[:200],
            "hint": "Re-issue using only MATCH / WITH / RETURN / UNWIND / OPTIONAL MATCH.",
        }
    params = args.get("params") or {}
    if not isinstance(params, dict):
        params = {}
    # Comments are whitespace in Cypher, so executing the stripped form is
    # semantically identical and lets `_cap_rows` append safely.
    capped = _cap_rows(_strip_cypher_comments(cypher))
    return _truncate_rows(get_neptune().run_cypher(capped, params) or [])


def _tool_kb(_name: str, args: dict) -> dict:
    return {"results": retrieve_kb(args.get("q", ""), top_k=args.get("top_k", 5))}


def _tool_compliance(_name: str, args: dict) -> dict:
    # Same lookup as /api/compliance (Neptune → synthetic fallback) so the
    # agent never judges a placeholder component with no substance data.
    extra = args.get("substances")
    return evaluate_component(
        component_id=args.get("component_id") or None,
        extra_substances=extra if isinstance(extra, list) else None,
    )


def _make_memory_tool(session_id: str):
    """memory_save bound to the *request's* session. The model never chooses
    the partition — a model-filled `session_id` (default "?") would collide
    every user's facts into one DynamoDB partition."""

    def _tool_memory(_name: str, args: dict) -> dict:
        save_fact(
            session_id=session_id,
            key=str(args.get("key") or "?"),
            value=str(args.get("value") or "?"),
        )
        return {"ok": True}

    return _tool_memory


# Tool definitions with explicit inputSchema (so Bedrock fills required fields).
# Tuple shape: (name, description, fn, input_schema)
_STATIC_TOOLS = [
    (
        "search_semantic",
        "Hybrid Korean+vector search over BOM/components/standards. Returns top-N hits.",
        _tool_search,
        {
            "type": "object",
            "properties": {
                "q": {
                    "type": "string",
                    "description": "Korean or English natural-language query, ≥3 chars (e.g. 'AEC-Q100 BGA package')",
                },
                "top_n": {"type": "integer", "description": "max hits to return (default 5)"},
            },
            "required": ["q"],
        },
    ),
    (
        "neptune_query",
        "Run a READ-ONLY openCypher query on the mfg knowledge graph (22 classes — "
        f"Component/Supplier/Plant/TradeLane/Standard/etc.). Results are capped at {_NEPTUNE_MAX_ROWS} rows / "
        f"~{_TOOL_RESULT_MAX_BYTES // 1000}KB; prefer projecting specific properties or aggregates over whole nodes.",
        _tool_neptune,
        {
            "type": "object",
            "properties": {
                "cypher": {
                    "type": "string",
                    "description": "Full openCypher query, e.g. 'MATCH (c:Component {id: $id}) RETURN c LIMIT 1'. Must NOT be empty.",
                },
                "params": {
                    "type": "object",
                    "description": "Optional Cypher parameters keyed by $name",
                    "additionalProperties": True,
                },
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
                "top_k": {
                    "type": "integer",
                    "description": "number of passages to retrieve (1-10, default 5)",
                },
            },
            "required": ["q"],
        },
    ),
    (
        "compliance_check",
        "Check a component's declared substances (CAS ids) against the REACH-SVHC and RoHS lists. "
        "Looks the component up in the knowledge graph. Does NOT verify AEC-Q / JEDEC qualification "
        "(declared standards are only echoed). Returns {status: compliant|non_compliant|insufficient_data, "
        "compliant: true|false|null, violations[]} — insufficient_data means no substance declaration, not compliant.",
        _tool_compliance,
        {
            "type": "object",
            "properties": {
                "component_id": {
                    "type": "string",
                    "description": "Component id (e.g. AMZN-CMP-IC-00001)",
                },
                "substances": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional CAS-IDs to check explicitly",
                },
            },
            "required": ["component_id"],
        },
    ),
]


_MEMORY_TOOL_DESC = "Persist a user fact for future conversations (e.g. 'prefers Tier-1 supplier X', 'budget cap 5M USD')."
_MEMORY_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        # No session_id: the server binds the request's session (see _make_memory_tool).
        "key": {"type": "string", "description": "Fact key (e.g. 'preference', 'constraint')"},
        "value": {"type": "string", "description": "Fact value"},
    },
    "required": ["key", "value"],
}


def _build_tools(session_id: str) -> list[tuple]:
    """Per-request tool list — session-scoped tools close over session_id."""
    return [
        *_STATIC_TOOLS,
        ("memory_save", _MEMORY_TOOL_DESC, _make_memory_tool(session_id), _MEMORY_TOOL_SCHEMA),
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
    "  • Use `compliance_check(component_id)` for REACH-SVHC / RoHS substance checks "
    "(it does not verify AEC-Q qualification; `insufficient_data` means no substance data, not compliant).\n"
    "Never call a tool with empty arguments — every tool requires the listed `required` fields. "
    "If a tool result is empty or errors out, acknowledge briefly and proceed without retrying the same call. "
    "Format output as Markdown when listing items (tables, bullets, **bold** for IDs).\n\n"
    "Graph schema — the only node labels and relationship types that exist in Neptune "
    "(direction as written):\n"
    # Same registry the loader and tests/integration/test_graph_contract.py use.
    # Escape braces: this string goes through str.format(persona=...).
    + registry.schema_hint().replace("{", "{{").replace("}", "}}") + "\n"
    "Match nodes by their application id, e.g. `MATCH (c:Component {{id: $id}})` "
    "(a Substance's id is its CAS number). List-valued properties (standards, substances, "
    "regulations) are stored comma-joined — use `split(c.standards, ',')`."
)


@router.post("/chat")
def chat(req: ChatRequest = Body(...)):
    runner = AgentRunner(
        tools=_build_tools(req.session_id),
        system=_SYSTEM_PROMPT_TEMPLATE.format(persona=req.persona),
    )

    def gen():
        # Capture streamed assistant deltas so we can generate follow-up
        # suggestions from the final response. Buffer is tiny (few KB);
        # Bedrock answers cap well under the 8K maxTokens budget.
        assistant_chunks: list[str] = []
        emitted_followups = False
        terminated = False
        try:
            for event in runner.run_stream(req.msg, session_id=req.session_id):
                etype = event.get("type")
                if etype == "delta":
                    text = event.get("text")
                    if text:
                        assistant_chunks.append(text)
                elif etype == "stop" and not emitted_followups:
                    # Emit suggested_followups BEFORE the terminal stop so
                    # clients that close on `stop` still pick them up.
                    # One-shot: even on max_rounds + retry the user sees a
                    # single chip set.
                    emitted_followups = True
                    answer = "".join(assistant_chunks)
                    suggestions = generate_followups(answer, req.persona, req.msg)
                    if suggestions:
                        yield as_event(
                            {
                                "type": "suggested_followups",
                                "items": suggestions,
                            }
                        )
                if etype == "stop":
                    terminated = True
                yield as_event(event)
        except Exception as e:
            # Mid-stream exception — the client otherwise sees a silent
            # connection close and can't tell "done" from "crashed". Emit a
            # synthetic error + stop so the UI can render a clean failure
            # state, then re-log with stack trace for CloudWatch debugging.
            log.exception("chat.gen() crashed mid-stream: %s", type(e).__name__)
            yield as_event(
                {
                    "type": "error",
                    "name": "chat_stream",
                    "content": f"채팅 스트림 처리 중 오류: {type(e).__name__}",
                }
            )
            yield as_event({"type": "stop", "reason": "stream_error"})
            terminated = True
        finally:
            # Belt-and-suspenders: guarantee at least one stop event reaches
            # the client even if the inner loop exits without emitting one.
            if not terminated:
                yield as_event({"type": "stop", "reason": "stream_end"})

    return EventSourceResponse(gen())
