from fastapi.testclient import TestClient
from api.main import app


def test_all_12_scenario_routes_present():
    client = TestClient(app)
    r = client.get("/openapi.json")
    paths = set(r.json()["paths"].keys())
    expected = {
        "/api/search", "/api/chat", "/api/insights", "/api/spec-match",
        "/api/compliance", "/api/substitute", "/api/price", "/api/lane",
        "/api/lane/reroute", "/api/supplier-rfm", "/api/eight-d",
        "/api/esg", "/api/pdm",
    }
    missing = expected - paths
    assert not missing, f"missing routes: {missing}"
