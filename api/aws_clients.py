"""boto3 client factories — cached for reuse across requests."""
from __future__ import annotations
import functools
import boto3
from api.config import settings


@functools.lru_cache(maxsize=8)
def bedrock_runtime():
    return boto3.client("bedrock-runtime", region_name=settings.aws_region)


@functools.lru_cache(maxsize=8)
def bedrock_agent_runtime():
    return boto3.client("bedrock-agent-runtime", region_name=settings.aws_region)


@functools.lru_cache(maxsize=8)
def secretsmanager():
    return boto3.client("secretsmanager", region_name=settings.aws_region)


@functools.lru_cache(maxsize=8)
def s3():
    return boto3.client("s3", region_name=settings.aws_region)


@functools.lru_cache(maxsize=8)
def dynamodb():
    return boto3.client("dynamodb", region_name=settings.aws_region)


@functools.lru_cache(maxsize=8)
def cloudwatch_logs():
    return boto3.client("logs", region_name=settings.aws_region)
