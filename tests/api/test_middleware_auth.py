# tests/api/test_middleware_auth.py
import time
from unittest.mock import patch

import jwt
import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from api import middleware_auth
from api.middleware_auth import CognitoBearerAuth
from tests.api.jwt_helpers import KID, id_token, jwks_response, new_key

SIGNING_KEY = new_key()


@pytest.fixture(autouse=True)
def fresh_jwks_cache(monkeypatch):
    # The verifier caches JWKS for an hour; isolate each test from the others.
    if hasattr(middleware_auth, "CognitoJwtVerifier"):
        monkeypatch.setattr(middleware_auth, "verifier", middleware_auth.CognitoJwtVerifier())


def _client() -> TestClient:
    app = FastAPI()
    app.add_middleware(CognitoBearerAuth, exempt_paths=["/healthz"])

    @app.get("/api/private")
    def private(request: Request):
        return {"email": request.state.user_email, "groups": request.state.user_groups}

    return TestClient(app)


def _get_with_cookie(token: str):
    client = _client()
    client.cookies.set("mfg_id_token", token)
    return client.get("/api/private")


@patch("api.middleware_auth.requests.get")
def test_auth_rejects_missing_bearer(_mock_get):
    app = FastAPI()
    app.add_middleware(CognitoBearerAuth, exempt_paths=["/healthz"])
    client = TestClient(app)
    r = client.get("/api/private")
    assert r.status_code == 401
    # Accept either old or new error message
    err = r.json().get("error", "")
    assert "token" in err.lower() or "auth" in err.lower()


@patch("api.middleware_auth.requests.get")
def test_auth_allows_exempt_paths(_mock_get):
    app = FastAPI()
    app.add_middleware(CognitoBearerAuth, exempt_paths=["/healthz"])

    @app.get("/healthz")
    def hz():
        return {"ok": True}

    client = TestClient(app)
    assert client.get("/healthz").status_code == 200


@patch("api.middleware_auth.requests.get")
def test_valid_id_token_cookie_is_accepted(mock_get):
    mock_get.return_value = jwks_response(SIGNING_KEY)
    r = _get_with_cookie(id_token(SIGNING_KEY))
    assert r.status_code == 200
    assert r.json() == {"email": "demo@whchoi.net", "groups": ["engineers"]}


@patch("api.middleware_auth.requests.get")
def test_valid_bearer_token_is_accepted(mock_get):
    mock_get.return_value = jwks_response(SIGNING_KEY)
    r = _client().get("/api/private", headers={"Authorization": f"Bearer {id_token(SIGNING_KEY)}"})
    assert r.status_code == 200


@patch("api.middleware_auth.requests.get")
def test_jwks_is_cached_across_requests(mock_get):
    mock_get.return_value = jwks_response(SIGNING_KEY)
    client = _client()
    client.cookies.set("mfg_id_token", id_token(SIGNING_KEY))
    assert client.get("/api/private").status_code == 200
    assert client.get("/api/private").status_code == 200
    assert mock_get.call_count == 1


@pytest.mark.parametrize(
    "token_factory",
    [
        pytest.param(
            lambda: id_token(SIGNING_KEY, iat=int(time.time()) - 7200, exp=int(time.time()) - 3600),
            id="expired",
        ),
        pytest.param(lambda: id_token(new_key()), id="forged-signature-same-kid"),
        pytest.param(lambda: id_token(SIGNING_KEY, kid="rotated-away"), id="unknown-kid"),
        pytest.param(
            lambda: jwt.encode(
                {"email": "x@evil", "exp": int(time.time()) + 3600},
                key="",
                algorithm="none",
                headers={"kid": KID},
            ),
            id="alg-none",
        ),
        pytest.param(
            lambda: id_token(
                SIGNING_KEY, iss="https://cognito-idp.us-east-1.amazonaws.com/us-east-1_OtherPool"
            ),
            id="wrong-issuer",
        ),
        pytest.param(
            lambda: id_token(SIGNING_KEY, aud="some-other-app-client"), id="wrong-audience"
        ),
        pytest.param(lambda: id_token(SIGNING_KEY, token_use="access"), id="access-token"),
        pytest.param(lambda: "not-a-jwt", id="garbage"),
    ],
)
@patch("api.middleware_auth.requests.get")
def test_invalid_tokens_are_rejected(mock_get, token_factory):
    mock_get.return_value = jwks_response(SIGNING_KEY)
    r = _get_with_cookie(token_factory())
    assert r.status_code == 401
    # Do not echo verifier internals back to the client.
    assert r.json() == {"error": "invalid token"}
