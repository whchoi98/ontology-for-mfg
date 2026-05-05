"""Centralized config — env-driven, validated at import."""
from __future__ import annotations
import os
from pydantic import BaseModel


class Settings(BaseModel):
    aws_region: str = os.environ.get("AWS_REGION", "ap-northeast-2")
    neptune_endpoint: str = os.environ.get("NEPTUNE_ENDPOINT", "")
    opensearch_host: str = os.environ.get("OPENSEARCH_HOST", "")
    opensearch_index: str = os.environ.get("OPENSEARCH_INDEX", "mfg-search")
    aurora_secret_arn: str = os.environ.get("AURORA_SECRET_ARN", "")
    bedrock_guardrail_id: str = os.environ.get("BEDROCK_GUARDRAIL_ID", "356xcbgyqcpq")
    bedrock_kb_id: str = os.environ.get("BEDROCK_KB_ID", "")
    sonnet_model: str = os.environ.get("MFG_SONNET_MODEL_ID", "anthropic.claude-sonnet-4-6-v1:0")
    haiku_model: str = os.environ.get("MFG_HAIKU_MODEL_ID", "anthropic.claude-haiku-4-5-20251001-v1:0")
    embed_model: str = os.environ.get("MFG_EMBED_MODEL_ID", "amazon.titan-embed-text-v2:0")
    rerank_model: str = os.environ.get("MFG_RERANK_MODEL_ID", "cohere.rerank-v3-5:0")
    cognito_user_pool_id: str = os.environ.get("COGNITO_USER_POOL_ID", "us-east-1_zQZZJRYer")
    cognito_region: str = "us-east-1"  # Edge stack region
    log_level: str = os.environ.get("LOG_LEVEL", "INFO")


settings = Settings()
