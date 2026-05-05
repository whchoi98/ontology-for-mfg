"""Cognito OAuth callback — exchanges auth code for tokens, sets cookie, redirects home.

Endpoints:
- GET /api/auth/login    : redirect to Cognito Hosted UI (manual entrypoint)
- GET /api/auth/callback : exchange ?code=... for tokens, set cookie, 302 to /
- GET /api/auth/logout   : clear cookie, 302 to Cognito logout
- GET /api/auth/whoami   : return auth status (exempt from middleware, reads cookie)
"""
from __future__ import annotations
import os
import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse

router = APIRouter(prefix="/auth", tags=["auth"])

COGNITO_DOMAIN = os.environ.get("COGNITO_DOMAIN", "ontology-mfg-dev.auth.us-east-1.amazoncognito.com")
CLIENT_ID = os.environ.get("COGNITO_CLIENT_ID", "422o42g8odcmv21860cu2jta4")
APP_BASE = os.environ.get("APP_BASE_URL", "https://mfg-ontology.whchoi.net")
CALLBACK_URL = f"{APP_BASE}/api/auth/callback"
LOGOUT_URL = f"{APP_BASE}/api/auth/logout"
COOKIE_NAME = "mfg_id_token"


@router.get("/login")
async def login() -> RedirectResponse:
    """Manual login entrypoint — redirects to Cognito Hosted UI."""
    url = (
        f"https://{COGNITO_DOMAIN}/login?client_id={CLIENT_ID}"
        f"&response_type=code&scope=openid+email"
        f"&redirect_uri={CALLBACK_URL}"
    )
    return RedirectResponse(url=url)


@router.get("/callback")
async def callback(code: str = Query(...)) -> RedirectResponse:
    """Exchange auth code for id_token, set cookie, redirect to home."""
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
        return RedirectResponse(url=f"{APP_BASE}/api/auth/login?error=token_exchange&detail={resp.text[:100]}")
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
    return response


@router.get("/logout")
async def logout() -> RedirectResponse:
    """Clear cookie and redirect to Cognito logout."""
    cognito_logout = (
        f"https://{COGNITO_DOMAIN}/logout?client_id={CLIENT_ID}"
        f"&logout_uri={APP_BASE}"
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
        import requests as _requests
        from jose import jwt
        from api.config import settings

        # Light-weight JWKS fetch (no caching needed — response is small and fast)
        jwks_url = (
            f"https://cognito-idp.{settings.cognito_region}.amazonaws.com"
            f"/{settings.cognito_user_pool_id}/.well-known/jwks.json"
        )
        keys = _requests.get(jwks_url, timeout=5).json().get("keys", [])
        header = jwt.get_unverified_header(token)
        key = next((k for k in keys if k["kid"] == header.get("kid")), None)
        if not key:
            return JSONResponse({"authenticated": False, "reason": "unknown_kid"})
        claims = jwt.decode(
            token, key, algorithms=["RS256"],
            options={"verify_aud": False, "verify_at_hash": False},
        )
        return JSONResponse({
            "authenticated": True,
            "email": claims.get("email"),
            "sub": claims.get("sub"),
            "username": claims.get("cognito:username"),
        })
    except Exception:
        return JSONResponse({"authenticated": False})
