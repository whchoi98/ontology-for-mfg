# tests/api/routers/test_chat_tools.py
"""Unit tests for the /chat agent tools (B5 Cypher cost cap + deny-list
bypasses, B6 compliance tool lookup, B7 search ids, B13 memory session
injection). Tools are plain functions — no Bedrock / Neptune / AOSS calls."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.routers import chat
from api.routers.chat import (
    _NEPTUNE_MAX_ROWS,
    _TOOL_RESULT_MAX_BYTES,
    _build_tools,
    _tool_neptune,
    _tool_search,
)


def _tool(tools: list[tuple], name: str) -> tuple:
    return next(t for t in tools if t[0] == name)


# ─── B5: read-only gateway deny-list ───────────────────────────────────────


@pytest.mark.parametrize(
    "cypher",
    [
        # canonical write clauses (regression — must stay blocked)
        "CREATE (n:Component {id: 'x'})",
        "MATCH (n) DETACH DELETE n",
        "match (n) delete n",
        "MATCH (n) SET n.x = 1",
        "MERGE (n:Supplier {id: 'S1'})",
        "MATCH (n)\nREMOVE n.name",
        "FOREACH (x IN [1] | CREATE (:X))",
        "LOAD CSV FROM 'https://x/y.csv' AS row RETURN row",
        "CALL db.labels()",
        "CALL dbms.listConfig()",
        "CALL apoc.periodic.iterate('MATCH (n) RETURN n', 'DELETE n', {})",
        # case / whitespace variants
        "MaTcH (n) DeTaCh\t\nDeLeTe n",
        "CALL\tdbms.listConfig()",
        "CALL\n  apoc.create.node(['X'], {})",
        # comment-split multi-word clauses (comments are whitespace in Cypher)
        "LOAD/**/CSV FROM 'https://x/y.csv' AS row RETURN row",
        "LOAD // hidden\nCSV FROM 'https://x/y.csv' AS row RETURN row",
        "CALL/**/db.labels()",
        "CALL /* x */ dbms.listConfig()",
        "CALL/**/apoc.periodic.iterate('a', 'b', {})",
        "USING/**/PERIODIC/**/COMMIT LOAD CSV FROM 'x' AS r RETURN r",
        # backtick-quoted procedure namespace
        "CALL `db`.labels()",
        "CALL `apoc`.`periodic`.iterate('a', 'b', {})",
        # string literal containing '//' must not hide a comment-split clause
        "RETURN '//' AS a LOAD/**/CSV FROM 'x' AS r RETURN r",
    ],
)
@patch("api.routers.chat.get_neptune")
def test_neptune_tool_blocks_write_and_bypass_attempts(mock_nep, cypher):
    out = _tool_neptune("neptune_query", {"cypher": cypher})
    assert "error" in out and out["error"].startswith("read-only mode"), out
    mock_nep.return_value.run_cypher.assert_not_called()


@pytest.mark.parametrize(
    "cypher",
    [
        "MATCH (c:Component {id: $id}) RETURN c LIMIT 1",
        "MATCH (s:Supplier) WHERE s.name = 'Settlement Co' RETURN s.id LIMIT 5",
        "MATCH (n) WHERE n.url CONTAINS 'http://example.com' RETURN n.id LIMIT 5",
        "OPTIONAL MATCH (c:Component)-[:SUPPLIED_BY]->(s) RETURN c.id, s.id LIMIT 5",
        "MATCH (n:Component) WITH n ORDER BY n.id UNWIND [1,2] AS x RETURN n.id, x LIMIT 5",
    ],
)
@patch("api.routers.chat.get_neptune")
def test_neptune_tool_allows_read_queries(mock_nep, cypher):
    mock_nep.return_value.run_cypher.return_value = [{"id": "C1"}]
    out = _tool_neptune("neptune_query", {"cypher": cypher, "params": {"id": "C1"}})
    assert "error" not in out
    assert out["results"] == [{"id": "C1"}]


# ─── B5: row cap (LIMIT append / clamp) ─────────────────────────────────────


def _executed(mock_nep) -> tuple[str, dict]:
    args = mock_nep.return_value.run_cypher.call_args[0]
    return args[0], args[1]


@patch("api.routers.chat.get_neptune")
def test_neptune_tool_appends_limit_when_missing(mock_nep):
    mock_nep.return_value.run_cypher.return_value = []
    _tool_neptune("neptune_query", {"cypher": "MATCH (t:Telemetry) RETURN t"})
    q, _ = _executed(mock_nep)
    assert q.rstrip().endswith(f"LIMIT {_NEPTUNE_MAX_ROWS}")


@patch("api.routers.chat.get_neptune")
def test_neptune_tool_limit_survives_trailing_line_comment(mock_nep):
    """An appended LIMIT must not land inside a trailing `//` comment."""
    mock_nep.return_value.run_cypher.return_value = []
    _tool_neptune("neptune_query", {"cypher": "MATCH (t:Telemetry) RETURN t // everything"})
    q, _ = _executed(mock_nep)
    assert "//" not in q
    assert q.rstrip().endswith(f"LIMIT {_NEPTUNE_MAX_ROWS}")


@patch("api.routers.chat.get_neptune")
def test_neptune_tool_clamps_oversized_limit(mock_nep):
    mock_nep.return_value.run_cypher.return_value = []
    _tool_neptune("neptune_query", {"cypher": "MATCH (t:Telemetry) RETURN t LIMIT 100000;"})
    q, _ = _executed(mock_nep)
    assert "100000" not in q
    assert q.rstrip().endswith(f"LIMIT {_NEPTUNE_MAX_ROWS}")


@patch("api.routers.chat.get_neptune")
def test_neptune_tool_keeps_small_limit(mock_nep):
    mock_nep.return_value.run_cypher.return_value = []
    _tool_neptune("neptune_query", {"cypher": "MATCH (t:Telemetry) RETURN t LIMIT 5"})
    q, _ = _executed(mock_nep)
    assert q.rstrip().endswith("LIMIT 5")


@patch("api.routers.chat.get_neptune")
def test_neptune_tool_clamps_parameterized_limit(mock_nep):
    mock_nep.return_value.run_cypher.return_value = []
    _tool_neptune(
        "neptune_query",
        {"cypher": "MATCH (t:Telemetry) RETURN t LIMIT $lim", "params": {"lim": 999999}},
    )
    q, params = _executed(mock_nep)
    assert q.rstrip().endswith(f"LIMIT {_NEPTUNE_MAX_ROWS}")
    assert "$lim" not in q


# ─── B5: serialized result truncation ──────────────────────────────────────


@patch("api.routers.chat.get_neptune")
def test_neptune_tool_truncates_row_count(mock_nep):
    """Neptune may still return more rows than asked (UNION, server quirks)."""
    mock_nep.return_value.run_cypher.return_value = [{"id": f"T{i}"} for i in range(5000)]
    out = _tool_neptune("neptune_query", {"cypher": "MATCH (t:Telemetry) RETURN t.id AS id"})
    assert len(out["results"]) <= _NEPTUNE_MAX_ROWS
    assert out["truncated"] is True
    assert "note" in out


@patch("api.routers.chat.get_neptune")
def test_neptune_tool_truncates_serialized_size(mock_nep):
    fat = {"~id": "x", "~properties": {"blob": "가" * 2000}}
    mock_nep.return_value.run_cypher.return_value = [{"t": fat} for _ in range(80)]
    out = _tool_neptune("neptune_query", {"cypher": "MATCH (t:Telemetry) RETURN t"})
    assert len(json.dumps(out, ensure_ascii=False).encode("utf-8")) <= _TOOL_RESULT_MAX_BYTES + 1024
    assert out["truncated"] is True
    assert 0 < len(out["results"]) < 80


@patch("api.routers.chat.get_neptune")
def test_neptune_tool_small_result_not_marked_truncated(mock_nep):
    mock_nep.return_value.run_cypher.return_value = [{"id": "C1"}]
    out = _tool_neptune(
        "neptune_query", {"cypher": "MATCH (c:Component) RETURN c.id AS id LIMIT 1"}
    )
    assert out["results"] == [{"id": "C1"}]
    assert not out.get("truncated")


# ─── B7: search tool returns application ids ───────────────────────────────


@patch("api.routers.chat.get_search")
def test_search_tool_returns_application_id_not_aoss_id(mock_search):
    mock_search.return_value.hybrid_search.return_value = [
        {
            "_id": "1%3A0%3AxYz-auto",
            "_source": {"id": "AMZN-CMP-IC-00001", "name": "MCU", "label": "Component"},
        },
        {"_id": "legacy-doc", "_source": {"name": "no app id"}},
    ]
    out = _tool_search("search_semantic", {"q": "BGA"})
    assert out["hits"][0]["id"] == "AMZN-CMP-IC-00001"
    assert out["hits"][0]["label"] == "Component"
    # Docs without an application id fall back to the AOSS id.
    assert out["hits"][1]["id"] == "legacy-doc"


# ─── B6: compliance tool reuses the router's lookup ────────────────────────


@patch("api.routers.compliance.get_neptune")
def test_compliance_tool_looks_up_component(mock_nep):
    mock_nep.return_value.run_cypher.return_value = [
        {
            "id": "AMZN-CMP-IC-00001",
            "name": "MCU",
            "category": "IC",
            "substances": ["7439-92-1"],
            "standards": ["AEC-Q100"],
        },
    ]
    fn = _tool(_build_tools("s1"), "compliance_check")[2]
    out = fn("compliance_check", {"component_id": "AMZN-CMP-IC-00001"})
    mock_nep.return_value.run_cypher.assert_called_once()
    assert out["compliant"] is False
    assert out["status"] == "non_compliant"


@patch("api.routers.compliance.get_neptune")
def test_compliance_tool_reports_missing_substance_data(mock_nep):
    """The graph loader drops list props, so real components carry no
    substances — that must surface as insufficient_data, never compliant."""
    mock_nep.return_value.run_cypher.return_value = [
        {
            "id": "AMZN-CMP-IC-00002",
            "name": "MCU",
            "category": "IC",
            "substances": None,
            "standards": None,
        },
    ]
    fn = _tool(_build_tools("s1"), "compliance_check")[2]
    out = fn("compliance_check", {"component_id": "AMZN-CMP-IC-00002"})
    assert out["compliant"] is None
    assert out["status"] == "insufficient_data"


def test_compliance_tool_description_is_truthful():
    desc = _tool(_build_tools("s1"), "compliance_check")[1]
    assert "REACH" in desc and "RoHS" in desc
    # The engine does not evaluate AEC-Q qualification — the tool must not claim it.
    assert "AEC-Q rules" not in desc
    assert "not" in desc.lower()


# ─── B13: memory_save session is injected server-side ──────────────────────


@patch("api.routers.chat.save_fact")
def test_memory_tool_ignores_model_supplied_session(mock_save):
    tools = _build_tools("real-session-123")
    name, _desc, fn, schema = _tool(tools, "memory_save")
    assert "session_id" not in schema["properties"]
    fn(name, {"session_id": "?", "key": "preference", "value": "MX over CN"})
    mock_save.assert_called_once_with(
        session_id="real-session-123", key="preference", value="MX over CN"
    )


@patch("api.routers.chat.save_fact")
@patch("api.routers.chat.generate_followups", return_value=[])
@patch("api.routers.chat.AgentRunner")
def test_chat_binds_memory_tool_to_request_session(mock_runner_cls, _fu, mock_save):
    mock_runner_cls.return_value.run_stream.return_value = iter(
        [
            {"type": "stop", "reason": "end_turn"},
        ]
    )
    client = TestClient(app)
    with client.stream("POST", "/api/chat", json={"msg": "hi", "session_id": "sess-A"}) as r:
        "".join(r.iter_text())
    tools = mock_runner_cls.call_args.kwargs["tools"]
    _name, _d, fn, _s = _tool(tools, "memory_save")
    fn("memory_save", {"session_id": "sess-B", "key": "k", "value": "v"})
    assert mock_save.call_args.kwargs["session_id"] == "sess-A"


def test_build_tools_is_per_request():
    """Two sessions must never share a memory closure."""
    a = _tool(_build_tools("A"), "memory_save")[2]
    b = _tool(_build_tools("B"), "memory_save")[2]
    assert a is not b
    assert chat  # module import sanity


@patch("api.routers.chat.get_neptune")
def test_neptune_tool_comment_stripping_preserves_string_literals(mock_nep):
    mock_nep.return_value.run_cypher.return_value = []
    _tool_neptune(
        "neptune_query",
        {
            "cypher": "MATCH (n) WHERE n.url = 'http://x/y' AND n.s = 'it\\'s // x' /* c */ RETURN n.id // tail",
        },
    )
    q, _ = _executed(mock_nep)
    assert "'http://x/y'" in q
    assert "'it\\'s // x'" in q
    assert "/* c */" not in q and "tail" not in q
