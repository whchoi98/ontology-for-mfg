"""Cognito OAuth callback — exchanges auth code for tokens, sets cookie, redirects home.

Endpoints:
- GET /api/auth/login    : redirect to Cognito Hosted UI (manual entrypoint)
- GET /api/auth/callback : exchange ?code=... for tokens, set cookie, 302 to /
- GET /api/auth/logout   : clear cookie, 302 to Cognito logout
"""
from __future__ import annotations
import os
import httpx
from fastapi import APIRouter, Query
from fastapi.responses import RedirectResponse

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
    # Redirect to /buyer/search and set cookie. SameSite=Lax allows the cookie on top-level navigations.
    response = RedirectResponse(url=f"{APP_BASE}/buyer/search")
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
