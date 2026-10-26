"""Mint Cognito-shaped RS256 ID tokens + a matching JWKS for auth tests."""

from __future__ import annotations

import time
from unittest.mock import MagicMock

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from api.config import settings

KID = "test-kid"
ISSUER = (
    f"https://cognito-idp.{settings.cognito_region}.amazonaws.com"
    f"/{settings.cognito_user_pool_id}"
)


def new_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def jwks_response(private_key: rsa.RSAPrivateKey, kid: str = KID) -> MagicMock:
    """A fake `requests.get(...)` response serving the key's public JWKS."""
    jwk = RSAAlgorithm.to_jwk(private_key.public_key(), as_dict=True)
    jwk.update({"kid": kid, "alg": "RS256", "use": "sig"})
    resp = MagicMock()
    resp.json.return_value = {"keys": [jwk]}
    return resp


def id_token(private_key: rsa.RSAPrivateKey, kid: str = KID, **overrides) -> str:
    """A valid Cognito ID token; pass claim=None to drop a claim."""
    now = int(time.time())
    claims = {
        "sub": "user-1",
        "email": "demo@whchoi.net",
        "cognito:username": "demo",
        "cognito:groups": ["engineers"],
        "iss": ISSUER,
        "aud": settings.cognito_client_id,
        "token_use": "id",
        "iat": now,
        "exp": now + 3600,
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": kid})
