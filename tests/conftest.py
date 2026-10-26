"""Shared pytest fixtures.

Bypasses CognitoBearerAuth middleware for all router tests so we can test
endpoint logic without a live Cognito token.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def bypass_auth(request):
    """Auto-patch CognitoBearerAuth.dispatch to pass-through for all tests."""
    # Only apply when test is under tests/api (not middleware unit tests themselves)
    if "test_middleware_auth" in request.node.nodeid:
        yield
        return

    async def _passthrough(self, request, call_next):
        request.state.user_email = "test@test.local"
        request.state.user_groups = ["engineers"]
        return await call_next(request)

    with patch("api.middleware_auth.CognitoBearerAuth.dispatch", _passthrough):
        yield


@pytest.fixture(autouse=True)
def pass_guardrail(request):
    """Unit suites never call Bedrock: stub the agent's guardrail check as a pass.
    Tests that exercise guardrail behaviour patch `api.services.agent.check_guardrail`
    themselves (an inner patch wins)."""
    from api.services.guardrails import GuardrailVerdict

    with patch("api.services.agent.check_guardrail", return_value=GuardrailVerdict(blocked=False)):
        yield


@pytest.fixture(autouse=True)
def fake_aws_credentials(monkeypatch):
    """Unit suites never use real AWS credentials. CI has none (SigV4 signing raised
    there while passing locally), and on the dev EC2 the instance role would let an
    unmocked boto3 call reach AWS silently — with these it fails loudly instead."""
    for var in ("AWS_PROFILE", "AWS_SHARED_CREDENTIALS_FILE", "AWS_CONFIG_FILE"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "testing")
