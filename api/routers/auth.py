"""Cognito OAuth callback — exchanges auth code for tokens, sets cookie, redirects home.

Endpoints:
- GET /api/auth/login    : redirect to Cognito Hosted UI (also where Lambda@Edge sends
                           unauthenticated viewers, so every login carries a `state`)
- GET /api/auth/callback : verify `state`, exchange ?code=... for tokens, set cookie, 302 to /
- GET /api/auth/logout   : clear cookie, 302 to Cognito logout
- GET /api/auth/whoami   : return auth status (exempt from middleware, reads cookie)
"""

from __future__ import annotations

import os
import secrets

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse

from api.config import settings
from api.middleware_auth import verifier

router = APIRouter(prefix="/auth", tags=["auth"])

COGNITO_DOMAIN = os.environ.get(
    "COGNITO_DOMAIN", "ontology-mfg-dev.auth.us-east-1.amazoncognito.com"
)
CLIENT_ID = settings.cognito_client_id
APP_BASE = os.environ.get("APP_BASE_URL", "https://mfg-ontology.whchoi.net")
CALLBACK_URL = f"{APP_BASE}/api/auth/callback"
LOGOUT_URL = f"{APP_BASE}/api/auth/logout"
COOKIE_NAME = "mfg_id_token"
# OAuth `state` bound to the browser that started the login (login-CSRF protection).
STATE_COOKIE = "mfg_oauth_state"
_STATE_TTL_S = 600


@router.get("/login")
async def login() -> RedirectResponse:
    """Login entrypoint — redirects to Cognito Hosted UI with a fresh `state`."""
    state = secrets.token_urlsafe(32)
    url = (
        f"https://{COGNITO_DOMAIN}/login?client_id={CLIENT_ID}"
        f"&response_type=code&scope=openid+email"
        f"&redirect_uri={CALLBACK_URL}&state={state}"
    )
    response = RedirectResponse(url=url)
    # SameSite=Lax still sends it on Cognito's top-level redirect back to /callback.
    response.set_cookie(
        key=STATE_COOKIE,
        value=state,
        max_age=_STATE_TTL_S,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/api/auth",
    )
    return response


@router.get("/callback", response_model=None)
async def callback(
    request: Request, code: str = Query(...), state: str = Query("")
) -> RedirectResponse | JSONResponse:
    """Verify `state`, exchange auth code for id_token, set cookie, redirect to home."""
    expected = request.cookies.get(STATE_COOKIE, "")
    if not expected or not secrets.compare_digest(state, expected):
        # A 400 rather than a redirect to /login: bouncing back would loop forever
        # for a browser that drops the state cookie.
        return JSONResponse({"error": "invalid_oauth_state"}, status_code=400)
    token_url = f"https://{COGNITO_DOMAIN}/oauth2/token"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            token_url,
            data={
                "grant_type": "authorization_code",
                "client_id": CLIENT_ID,
                "code": code,
                "redirect_uri": CALLBACK_URL,
            },
            headers={"content-type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code != 200:
        return RedirectResponse(
            url=f"{APP_BASE}/api/auth/login?error=token_exchange&detail={resp.text[:100]}"
        )
    payload = resp.json()
    id_token = payload.get("id_token")
    if not id_token:
        return RedirectResponse(url=f"{APP_BASE}/api/auth/login?error=no_id_token")
    # Redirect to / (dashboard) and set cookie. SameSite=Lax allows the cookie on top-level navigations.
    response = RedirectResponse(url=f"{APP_BASE}/")
    response.set_cookie(
        key=COOKIE_NAME,
        value=id_token,
        max_age=3600,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    response.delete_cookie(STATE_COOKIE, path="/api/auth")
    return response


@router.get("/logout")
async def logout() -> RedirectResponse:
    """Clear cookie and redirect to Cognito logout.

    Cognito requires `logout_uri` to exact-string-match one of the App
    Client's registered LogoutURLs — trailing slash and all. The pool has
    `https://mfg-ontology.whchoi.net/` registered (with slash), so we strip
    any trailing slash from APP_BASE and re-add exactly one to avoid drift
    if APP_BASE_URL ever changes shape.
    """
    logout_redirect = APP_BASE.rstrip("/") + "/"
    cognito_logout = (
        f"https://{COGNITO_DOMAIN}/logout?client_id={CLIENT_ID}" f"&logout_uri={logout_redirect}"
    )
    response = RedirectResponse(url=cognito_logout)
    response.delete_cookie(COOKIE_NAME, path="/")
    return response


@router.get("/whoami")
async def whoami(request: Request) -> JSONResponse:
    """Return auth status by inspecting the mfg_id_token cookie.

    This endpoint is exempt from the auth middleware (path startswith /api/auth).
    Returns { authenticated: true, email, sub } or { authenticated: false }.
    """
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return JSONResponse({"authenticated": False})
    try:
        # Same verifier (and JWKS cache) as the auth middleware.
        claims = verifier.verify(token)
    except Exception:
        return JSONResponse({"authenticated": False})
    return JSONResponse(
        {
            "authenticated": True,
            "email": claims.get("email"),
            "sub": claims.get("sub"),
            "username": claims.get("cognito:username"),
        }
    )
