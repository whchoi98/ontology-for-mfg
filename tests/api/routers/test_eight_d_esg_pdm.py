# tests/api/routers/test_eight_d_esg_pdm.py
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app


@patch("api.routers.eight_d.draft_eight_d")
@patch("api.routers.eight_d.retrieve_kb")
@patch("api.routers.eight_d.get_neptune")
def test_eight_d(mock_n, mock_kb, mock_draft):
    """8D is SSE since v0.3.0 — exercise the SSE generator directly rather
    than going through TestClient (sse-starlette + httpx TestClient
    cross-test event-loop pollution would otherwise flake here). The
    router's `eight_d()` returns an `EventSourceResponse(gen())`; we
    invoke the closure inside it and consume the generator.

    Module-level `_BEDROCK_POOL` is swapped for an inline executor so
    `future.result(timeout=...)` returns the mocked draft synchronously.
    """
    import concurrent.futures as _cf
    import json as _json
    from api.routers.eight_d import eight_d, EightDRequest

    class _InlineExecutor:
        def submit(self, fn, *args, **kwargs):
            f: _cf.Future = _cf.Future()
            try:
                f.set_result(fn(*args, **kwargs))
            except Exception as e:  # pragma: no cover
                f.set_exception(e)
            return f

    mock_n.return_value.run_cypher.return_value = [
        {"id": "INC-2026-0412", "title": "BGA crack", "component_id": "C1",
         "plant_id": "P1", "severity": "CRITICAL"},
    ]
    mock_kb.return_value = []
    mock_draft.return_value = {
        f"d{i}_{key}": "section content"
        for i, key in enumerate(
            ["team", "problem", "containment", "root_cause", "corrective",
             "implemented", "prevention", "closure"], start=1
        )
    }

    import asyncio

    async def _drain():
        resp = eight_d(EightDRequest(incident_id="INC-2026-0412"))
        out = []
        async for chunk in resp.body_iterator:
            payload = chunk.get("data") if isinstance(chunk, dict) else None
            if payload:
                out.append(_json.loads(payload))
        return out

    with patch("api.routers.eight_d._BEDROCK_POOL", _InlineExecutor()):
        events = asyncio.run(_drain())

    types = [e["type"] for e in events]
    assert "phase" in types and "result" in types and "stop" in types

    result = next(e for e in events if e["type"] == "result")
    assert result["markdown"]
    assert isinstance(result["sections"], list) and len(result["sections"]) == 8


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


@patch("api.routers.pdm.get_neptune")
def test_pdm(mock_n):
    mock_n.return_value.run_cypher.return_value = [
        {"sensor_id": "AMZN-SENSOR-00001", "metric": "vibration", "unit": "g", "plant_id": "P1"},
    ]
    r = TestClient(app).post("/api/pdm", json={"plant_id": "P1"})
    assert r.status_code == 200
    assert "sensors" in r.json()
