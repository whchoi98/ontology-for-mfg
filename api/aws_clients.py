"""boto3 client factories — cached for reuse across requests.

Always go through these factories instead of calling `boto3.client(...)`
inline: boto3 client *creation* is not thread-safe (ops eval fans out on 8
threads), and a client per call re-resolves credentials every time.
"""

from __future__ import annotations

import functools
import threading

import boto3
from botocore.config import Config

from api.config import settings

# lru_cache does not serialise a cache *miss*, so two threads hitting a cold
# factory would build clients concurrently on boto3's shared default session.
_CREATE_LOCK = threading.Lock()


def _client(service: str, **kwargs):
    with _CREATE_LOCK:
        return boto3.client(service, region_name=settings.aws_region, **kwargs)


# Bedrock calls are bounded in-process at 25s (`_BEDROCK_BUDGET_S`), but that
# only abandons the *wait* — without an explicit Config the worker thread
# keeps blocking on botocore's defaults (read_timeout=60s, legacy retry mode
# with 5 attempts → minutes per call). read_timeout is per socket read: for
# converse_stream that is the gap between chunks, for blocking converse
# (8D writer, 6–10s) it is the whole generation, so it must stay above the
# 25s budget. Standard mode + 2 attempts still absorbs one throttle.
_BEDROCK_CONFIG = Config(
    connect_timeout=5,
    read_timeout=30,
    retries={"mode": "standard", "max_attempts": 2},
)


@functools.lru_cache(maxsize=8)
def bedrock_runtime():
    return _client("bedrock-runtime", config=_BEDROCK_CONFIG)


@functools.lru_cache(maxsize=8)
def bedrock_agent_runtime():
    return _client("bedrock-agent-runtime", config=_BEDROCK_CONFIG)


@functools.lru_cache(maxsize=8)
def secretsmanager():
    return _client("secretsmanager")


@functools.lru_cache(maxsize=8)
def s3():
    return _client("s3")


@functools.lru_cache(maxsize=8)
def dynamodb():
    return _client("dynamodb")


@functools.lru_cache(maxsize=8)
def cloudwatch_logs():
    return _client("logs")
