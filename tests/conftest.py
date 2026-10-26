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
