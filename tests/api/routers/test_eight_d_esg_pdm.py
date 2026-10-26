# tests/api/routers/test_eight_d_esg_pdm.py
import asyncio
import concurrent.futures as _cf
import json as _json
from unittest.mock import patch

from fastapi.testclient import TestClient

from api.main import app


class _InlineExecutor:
    """Runs the submitted fn synchronously so `future.result(timeout=...)`
    returns the mocked draft immediately."""

    def submit(self, fn, *args, **kwargs):
        f: _cf.Future = _cf.Future()
        try:
            f.set_result(fn(*args, **kwargs))
        except Exception as e:  # pragma: no cover
            f.set_exception(e)
        return f


_FULL_DRAFT = {
    f"d{i}_{key}": "section content"
    for i, key in enumerate(
        [
            "team",
            "problem",
            "containment",
            "root_cause",
            "corrective",
            "implemented",
            "prevention",
            "closure",
        ],
        start=1,
    )
}

_INC_ROW = {
    "id": "INC-2026-0412",
    "title": "BGA crack",
    "component_id": "C1",
    "plant_id": "P1",
    "severity": "CRITICAL",
}


def _drain_eight_d(incident_id: str = "INC-2026-0412", executor=None) -> list[dict]:
    """8D is SSE since v0.3.0 — exercise the SSE generator directly rather
    than going through TestClient (sse-starlette + httpx TestClient
    cross-test event-loop pollution would otherwise flake here). The
    router's `eight_d()` returns an `EventSourceResponse(gen())`; we
    consume its body iterator."""
    from api.routers.eight_d import EightDRequest, eight_d

    async def _drain():
        resp = eight_d(EightDRequest(incident_id=incident_id))
        out = []
        async for chunk in resp.body_iterator:
            payload = chunk.get("data") if isinstance(chunk, dict) else None
            if payload:
                out.append(_json.loads(payload))
        return out

    with patch("api.routers.eight_d._BEDROCK_POOL", executor or _InlineExecutor()):
        return asyncio.run(_drain())


@patch("api.routers.eight_d.draft_eight_d")
@patch("api.routers.eight_d.retrieve_kb")
@patch("api.routers.eight_d.get_neptune")
def test_eight_d(mock_n, mock_kb, mock_draft):
    mock_n.return_value.run_cypher.return_value = [_INC_ROW]
    mock_kb.return_value = []
    mock_draft.return_value = dict(_FULL_DRAFT)

    events = _drain_eight_d()

    types = [e["type"] for e in events]
    assert "phase" in types and "result" in types and "stop" in types

    result = next(e for e in events if e["type"] == "result")
    assert result["markdown"]
    assert isinstance(result["sections"], list) and len(result["sections"]) == 8
    assert result["fallback"] is False


@patch("api.routers.eight_d.draft_eight_d")
@patch("api.routers.eight_d.retrieve_kb")
@patch("api.routers.eight_d.get_neptune")
def test_eight_d_mode_label_reflects_runtime_model(mock_n, mock_kb, mock_draft):
    """The writer runs on settings.haiku_model — the report must not claim
    a hardcoded Sonnet model."""
    from api.routers import eight_d as mod

    mock_n.return_value.run_cypher.return_value = [_INC_ROW]
    mock_kb.return_value = []
    mock_draft.return_value = dict(_FULL_DRAFT)
    with patch.object(
        mod.settings, "haiku_model", "global.anthropic.claude-haiku-4-5-20251001-v1:0"
    ):
        events = _drain_eight_d()
    md = next(e for e in events if e["type"] == "result")["markdown"]
    assert "Sonnet" not in md
    assert "Haiku 4.5" in md


@patch("api.routers.eight_d.draft_eight_d")
@patch("api.routers.eight_d.retrieve_kb")
@patch("api.routers.eight_d.get_neptune")
def test_eight_d_tolerates_non_string_model_output(mock_n, mock_kb, mock_draft):
    """Tool-use input is model-generated JSON — sections can come back as
    null / lists / numbers. Must not crash on `.startswith`."""
    mock_n.return_value.run_cypher.return_value = [_INC_ROW]
    mock_kb.return_value = []
    draft = dict(_FULL_DRAFT)
    draft["d1_team"] = None
    draft["d2_problem"] = ["5W1H", "320 ppm"]
    draft["d3_containment"] = 42
    mock_draft.return_value = draft

    events = _drain_eight_d()
    result = next(e for e in events if e["type"] == "result")
    assert events[-1]["type"] == "stop"
    by_code = {s["section"]: s["content"] for s in result["sections"]}
    assert all(isinstance(v, str) for v in by_code.values())
    assert "320 ppm" in by_code["D2"]
    assert by_code["D3"] == "42"
    assert result["fallback"] is False


@patch("api.routers.eight_d.draft_eight_d")
@patch("api.routers.eight_d.retrieve_kb")
@patch("api.routers.eight_d.get_neptune")
def test_eight_d_non_dict_model_output_falls_back(mock_n, mock_kb, mock_draft):
    mock_n.return_value.run_cypher.return_value = [_INC_ROW]
    mock_kb.return_value = []
    mock_draft.return_value = ["not", "a", "dict"]
    events = _drain_eight_d()
    result = next(e for e in events if e["type"] == "result")
    assert result["fallback"] is True
    assert len(result["sections"]) == 8
    assert events[-1]["type"] == "stop"


@patch("api.routers.eight_d._assemble_markdown", side_effect=RuntimeError("boom"))
@patch("api.routers.eight_d.draft_eight_d")
@patch("api.routers.eight_d.retrieve_kb")
@patch("api.routers.eight_d.get_neptune")
def test_eight_d_always_emits_stop_on_crash(mock_n, mock_kb, mock_draft, _md):
    mock_n.return_value.run_cypher.return_value = [_INC_ROW]
    mock_kb.return_value = []
    mock_draft.return_value = dict(_FULL_DRAFT)
    events = _drain_eight_d()
    types = [e["type"] for e in events]
    assert "error" in types
    assert types[-1] == "stop"
    assert types.count("stop") == 1


@patch("api.routers.eight_d.retrieve_kb")
@patch("api.routers.eight_d.get_neptune")
def test_eight_d_null_incident_title_does_not_crash(mock_n, mock_kb):
    mock_n.return_value.run_cypher.return_value = [{**_INC_ROW, "title": None}]
    mock_kb.return_value = []
    with patch("api.routers.eight_d.draft_eight_d", side_effect=RuntimeError("bedrock down")):
        events = _drain_eight_d()
    result = next(e for e in events if e["type"] == "result")
    assert result["fallback"] is True
    assert events[-1]["type"] == "stop"


@patch("api.routers.eight_d.retrieve_kb")
@patch("api.routers.eight_d.get_neptune")
def test_eight_d_cancels_bedrock_future_on_timeout(mock_n, mock_kb):
    """A queued (pool-saturated) or slow draft must be cancelled once the
    budget expires so it doesn't burn a Bedrock call nobody waits for."""
    mock_n.return_value.run_cypher.return_value = [_INC_ROW]
    mock_kb.return_value = []
    pending: _cf.Future = _cf.Future()  # never completes

    class _PendingExecutor:
        def submit(self, fn, *a, **kw):
            return pending

    with patch("api.routers.eight_d._BEDROCK_BUDGET_S", 0.01):
        events = _drain_eight_d(executor=_PendingExecutor())
    assert pending.cancelled()
    result = next(e for e in events if e["type"] == "result")
    assert result["fallback"] is True
    assert events[-1]["type"] == "stop"


@patch("api.routers.esg_cbam.get_neptune")
def test_esg(mock_n):
    mock_n.return_value.run_cypher.return_value = [
        {"plant_id": "P1", "region": "KR", "scope": 1, "tons": 100},
        {"plant_id": "P1", "region": "KR", "scope": 2, "tons": 200},
        {"plant_id": "P1", "region": "KR", "scope": 3, "tons": 50},
    ]
    r = TestClient(app).post("/api/esg", json={})
    assert r.status_code == 200
    assert "P1" in r.json()["plants"]


@patch("api.routers.esg_cbam.get_neptune")
def test_esg_neptune_unconfigured_falls_back(mock_n):
    mock_n.side_effect = RuntimeError("NEPTUNE_ENDPOINT not configured")
    r = TestClient(app).post("/api/esg", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["_synthetic"] is True
    assert body["plants"]


@patch("api.routers.pdm.get_neptune")
def test_pdm(mock_n):
    mock_n.return_value.run_cypher.return_value = [
        {"sensor_id": "AMZN-SENSOR-00001", "metric": "vibration", "unit": "g", "plant_id": "P1"},
    ]
    r = TestClient(app).post("/api/pdm", json={"plant_id": "P1"})
    assert r.status_code == 200
    assert "sensors" in r.json()


@patch("api.routers.pdm.get_neptune")
def test_pdm_neptune_unconfigured_falls_back(mock_n):
    mock_n.side_effect = RuntimeError("NEPTUNE_ENDPOINT not configured")
    r = TestClient(app).post("/api/pdm", json={"plant_id": "P1"})
    assert r.status_code == 200
    body = r.json()
    assert body["_synthetic"] is True
    assert body["sensors"]


def test_model_chip_label_is_read_from_the_model_id():
    """The 8D chip once said "Sonnet 4.6" while a different model ran — derive it."""
    from api.routers.eight_d import _short_model_label

    assert _short_model_label("global.anthropic.claude-haiku-4-5-20251001-v1:0") == "Haiku 4.5"
    assert _short_model_label("global.anthropic.claude-sonnet-5-5") == "Sonnet 5.5"
    assert _short_model_label("anthropic.claude-opus-5") == "Opus 5"
    assert _short_model_label("") == "Bedrock"
