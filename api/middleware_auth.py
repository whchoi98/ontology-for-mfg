"""Cognito JWT bearer middleware. Verifies JWT signature against the user pool's
JWKS public keys. Group claim (`cognito:groups`) is exposed via request.state.user_groups
so downstream router-level guards can authorize per persona.
"""
from __future__ import annotations
import time
from typing import Iterable
import requests
from jose import jwt, JWTError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from api.config import settings


class CognitoBearerAuth(BaseHTTPMiddleware):
    def __init__(self, app, exempt_paths: Iterable[str] = ()):
        super().__init__(app)
        self.exempt = set(exempt_paths) | {"/healthz", "/docs", "/openapi.json", "/api/auth"}
        self._jwks_cache: dict | None = None
        self._jwks_fetched_at: float = 0.0

    async def dispatch(self, request: Request, call_next):
        if any(request.url.path.startswith(p) for p in self.exempt):
            return await call_next(request)
        # Accept either Authorization: Bearer <token> OR mfg_id_token cookie
        auth = request.headers.get("authorization", "")
        token: str | None = None
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
        if not token:
            token = request.cookies.get("mfg_id_token")
        if not token:
            return JSONResponse({"error": "authentication required"}, status_code=401)
        try:
            claims = self._verify(token)
        except JWTError as e:
            return JSONResponse({"error": f"invalid token: {e}"}, status_code=401)
        request.state.user_email = claims.get("email")
        request.state.user_groups = claims.get("cognito:groups", []) or []
        return await call_next(request)

    def _jwks(self) -> dict:
        if self._jwks_cache and time.time() - self._jwks_fetched_at < 3600:
            return self._jwks_cache
        url = (
            f"https://cognito-idp.{settings.cognito_region}.amazonaws.com"
            f"/{settings.cognito_user_pool_id}/.well-known/jwks.json"
        )
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        self._jwks_cache = resp.json()
        self._jwks_fetched_at = time.time()
        return self._jwks_cache

    def _verify(self, token: str) -> dict:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        keys = self._jwks().get("keys", [])
        key = next((k for k in keys if k["kid"] == kid), None)
        if not key:
            raise JWTError("kid not in JWKS")
        return jwt.decode(token, key, algorithms=["RS256"], options={"verify_aud": False})
