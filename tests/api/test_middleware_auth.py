# tests/api/test_middleware_auth.py
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.middleware_auth import CognitoBearerAuth


@patch("api.middleware_auth.requests.get")
def test_auth_rejects_missing_bearer(_mock_get):
    app = FastAPI()
    app.add_middleware(CognitoBearerAuth, exempt_paths=["/healthz"])
    client = TestClient(app)
    r = client.get("/api/private")
    assert r.status_code == 401


@patch("api.middleware_auth.requests.get")
def test_auth_allows_exempt_paths(_mock_get):
    app = FastAPI()
    app.add_middleware(CognitoBearerAuth, exempt_paths=["/healthz"])
    @app.get("/healthz")
    def hz(): return {"ok": True}
    client = TestClient(app)
    assert client.get("/healthz").status_code == 200
