"""End-to-end contract coverage for the 12 scenario routers.

These integration tests verify that:
1. Every expected scenario endpoint is wired into the app
2. Every sync endpoint declares a Pydantic response_model (v0.5.0 contract guarantee)
3. The OpenAPI spec is machine-usable (non-empty schemas for declared routes)

If a router is renamed, dropped, or loses its response_model declaration,
these will fail-fast — preventing the kind of contract regression that
the harness-eval flagged as "completeness=5" in v0.4.0.
"""
from fastapi.testclient import TestClient

from api.main import app

EXPECTED_SCENARIO_PATHS = {
    "/api/search",
    "/api/chat",
    "/api/insights",
    "/api/spec-match",
    "/api/compliance",
    "/api/substitute",
    "/api/price",
    "/api/lane",
    "/api/lane/reroute",
    "/api/supplier-rfm",
    "/api/eight-d",
    "/api/esg",
    "/api/pdm",
}

SSE_PATHS = {"/api/chat", "/api/insights", "/api/eight-d"}


def _openapi_paths() -> dict:
    return TestClient(app).get("/openapi.json").json()["paths"]


def test_all_12_scenarios_wired():
    paths = _openapi_paths()
    missing = EXPECTED_SCENARIO_PATHS - set(paths)
    assert not missing, f"scenario endpoints missing: {sorted(missing)}"


def test_sync_endpoints_declare_response_model():
    """Every sync (non-SSE) scenario must declare a Pydantic response_model so the
    OpenAPI spec carries a real schema, not {}. Locks the v0.5.0 contract work."""
    paths = _openapi_paths()
    sync_scenarios = EXPECTED_SCENARIO_PATHS - SSE_PATHS
    weak = []
    for p in sync_scenarios:
        op = paths.get(p, {}).get("post") or paths.get(p, {}).get("get") or {}
        responses = op.get("responses", {})
        ok_schema = responses.get("200", {}).get("content", {}).get("application/json", {}).get("schema")
        if not ok_schema or ok_schema == {}:
            weak.append(p)
    assert not weak, f"endpoints missing response_model schema: {weak}"


def test_health_endpoint_alive():
    r = TestClient(app).get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_openapi_has_metadata():
    spec = TestClient(app).get("/openapi.json").json()
    assert spec["info"]["title"] == "ontology-mfg api"
    assert spec["info"]["version"], "version string must not be empty"
