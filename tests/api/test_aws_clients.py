# tests/api/test_aws_clients.py
"""Bedrock clients must carry an explicit botocore Config — the defaults
(read_timeout=60s, legacy mode with 5 attempts) keep a worker thread busy
for minutes after the 25s in-process budget has already given up."""

from unittest.mock import patch

import pytest

import api.aws_clients as ac


def _config_for(factory):
    factory.cache_clear()
    try:
        with patch("api.aws_clients.boto3.client") as mk:
            factory()
        return mk.call_args.kwargs.get("config")
    finally:
        factory.cache_clear()


@pytest.mark.parametrize("factory", [ac.bedrock_runtime, ac.bedrock_agent_runtime])
def test_bedrock_clients_have_bounded_timeouts_and_retries(factory):
    cfg = _config_for(factory)
    assert cfg is not None, "Bedrock client created without botocore Config"
    assert cfg.connect_timeout == 5
    # Above the 25s in-process budget (so a slow-but-successful 8D draft is
    # not killed early) yet far below the 60s default.
    assert 25 < cfg.read_timeout <= 45
    assert cfg.retries == {"mode": "standard", "max_attempts": 2}


def test_factories_are_cached():
    """Thread-safety: boto3 client *creation* is not thread-safe, so callers
    must share the cached instance instead of building one per call."""
    ac.dynamodb.cache_clear()
    try:
        with patch("api.aws_clients.boto3.client") as mk:
            a = ac.dynamodb()
            b = ac.dynamodb()
        assert a is b
        assert mk.call_count == 1
    finally:
        ac.dynamodb.cache_clear()
