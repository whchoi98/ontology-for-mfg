"""Cognito JWT bearer middleware. Verifies the ID token's RS256 signature against the
user pool's JWKS public keys, plus its iss / aud / token_use / exp claims. Group claim
(`cognito:groups`) is exposed via request.state.user_groups so downstream
router-level guards can authorize per persona.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterable

import jwt
import requests
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from api.config import settings

log = logging.getLogger("mfg.auth")

_JWKS_TTL_S = 3600
# Tolerates clock skew between Cognito and the task — PyJWT rejects an `iat` in the future.
_LEEWAY_S = 30


class CognitoJwtVerifier:
    """Verifies ID tokens that the pool minted for our app client (the mfg_id_token cookie)."""

    def __init__(self) -> None:
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched_at: float = 0.0

    @property
    def issuer(self) -> str:
        return (
            f"https://cognito-idp.{settings.cognito_region}.amazonaws.com"
            f"/{settings.cognito_user_pool_id}"
        )

    def _signing_key(self, kid: str | None) -> jwt.PyJWK:
        if not self._keys or time.time() - self._fetched_at >= _JWKS_TTL_S:
            resp = requests.get(f"{self.issuer}/.well-known/jwks.json", timeout=5)
            resp.raise_for_status()
            self._keys = {k["kid"]: jwt.PyJWK(k) for k in resp.json().get("keys", [])}
            self._fetched_at = time.time()
        key = self._keys.get(kid) if kid else None
        if key is None:
            raise jwt.InvalidTokenError("kid not in JWKS")
        return key

    def verify(self, token: str) -> dict:
        kid = jwt.get_unverified_header(token).get("kid")
        claims = jwt.decode(
            token,
            self._signing_key(kid).key,
            algorithms=["RS256"],
            audience=settings.cognito_client_id,
            issuer=self.issuer,
            leeway=_LEEWAY_S,
            options={"require": ["exp", "iat", "iss", "aud", "token_use"]},
        )
        # An access token from the same pool is signed by the same keys but carries no `aud`
        # and is not what the cookie holds — accept ID tokens only.
        if claims["token_use"] != "id":
            raise jwt.InvalidTokenError(f"token_use={claims['token_use']!r}, expected 'id'")
        return claims


verifier = CognitoJwtVerifier()


class CognitoBearerAuth(BaseHTTPMiddleware):
    def __init__(self, app, exempt_paths: Iterable[str] = ()):
        super().__init__(app)
        self.exempt = set(exempt_paths) | {"/healthz", "/docs", "/openapi.json", "/api/auth"}

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
            log.warning(
                "auth: no token for %s %s (cookies: %s)",
                request.method,
                request.url.path,
                list(request.cookies.keys()),
            )
            return JSONResponse({"error": "authentication required"}, status_code=401)
        try:
            claims = verifier.verify(token)
        except jwt.PyJWTError as e:
            log.warning("auth: jwt error for %s %s — %s", request.method, request.url.path, e)
            return JSONResponse({"error": "invalid token"}, status_code=401)
        except Exception as e:
            log.error(
                "auth: unexpected error for %s %s — %s: %s",
                request.method,
                request.url.path,
                type(e).__name__,
                e,
            )
            return JSONResponse({"error": "authentication error"}, status_code=401)
        request.state.user_email = claims.get("email")
        request.state.user_groups = claims.get("cognito:groups", []) or []
        return await call_next(request)
