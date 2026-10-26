from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from api.main import app
from tests.api.jwt_helpers import id_token, jwks_response, new_key


def test_login_redirects_to_cognito():
    client = TestClient(app)
    r = client.get("/api/auth/login", follow_redirects=False)
    assert r.status_code == 307 or r.status_code == 302
    assert "amazoncognito.com" in r.headers["location"]


def test_login_binds_oauth_state_to_browser():
    client = TestClient(app)
    r = client.get("/api/auth/login", follow_redirects=False)
    state = parse_qs(urlparse(r.headers["location"]).query)["state"][0]
    assert len(state) >= 32
    assert f"mfg_oauth_state={state}" in r.headers["set-cookie"]
    assert "HttpOnly" in r.headers["set-cookie"]


@patch("api.routers.auth.httpx.AsyncClient")
def test_callback_rejects_missing_or_mismatched_state(mock_client_cls):
    # Login CSRF: an attacker's own ?code= must not be accepted without the victim's state.
    client = TestClient(app)
    assert client.get("/api/auth/callback?code=X", follow_redirects=False).status_code == 400
    client.cookies.set("mfg_oauth_state", "expected-state")
    r = client.get("/api/auth/callback?code=X&state=attacker-state", follow_redirects=False)
    assert r.status_code == 400
    mock_client_cls.assert_not_called()


@patch("api.routers.auth.httpx.AsyncClient")
def test_callback_exchanges_code_and_sets_cookie(mock_client_cls):
    # Build a fake async context manager whose .post() returns a mock response
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json = lambda: {"id_token": "fake-jwt"}

    mock_inner = AsyncMock()
    mock_inner.post = AsyncMock(return_value=mock_response)

    mock_ctx = MagicMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_inner)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_client_cls.return_value = mock_ctx

    client = TestClient(app)
    client.cookies.set("mfg_oauth_state", "s-123")
    r = client.get("/api/auth/callback?code=AUTH_CODE&state=s-123", follow_redirects=False)
    assert r.status_code in (302, 307)
    cookies = r.headers.get_list("set-cookie")
    assert any(c.startswith("mfg_id_token=fake-jwt") for c in cookies)
    # The one-time state is consumed.
    assert any(c.startswith("mfg_oauth_state=") and "Max-Age=0" in c for c in cookies)


@patch("api.middleware_auth.requests.get")
def test_whoami_reports_authenticated_for_valid_cookie(mock_get):
    key = new_key()
    mock_get.return_value = jwks_response(key)
    client = TestClient(app)
    client.cookies.set("mfg_id_token", id_token(key))
    r = client.get("/api/auth/whoami")
    assert r.json() == {
        "authenticated": True,
        "email": "demo@whchoi.net",
        "sub": "user-1",
        "username": "demo",
    }


@patch("api.middleware_auth.requests.get")
def test_whoami_rejects_token_for_other_app_client(mock_get):
    key = new_key()
    mock_get.return_value = jwks_response(key)
    client = TestClient(app)
    client.cookies.set("mfg_id_token", id_token(key, aud="some-other-app-client"))
    assert client.get("/api/auth/whoami").json()["authenticated"] is False


def test_logout_clears_cookie():
    client = TestClient(app)
    r = client.get("/api/auth/logout", follow_redirects=False)
    assert r.status_code in (302, 307)
    assert "amazoncognito.com" in r.headers["location"]
    cookies = r.headers.get("set-cookie", "")
    assert "mfg_id_token" in cookies and "Max-Age=0" in cookies
