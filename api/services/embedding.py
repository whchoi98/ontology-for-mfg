# api/services/embedding.py
"""Cohere multilingual v3 embedding via Bedrock."""
from __future__ import annotations
import json
import boto3
from api.config import settings


def embed_text(text: str) -> list[float]:
    client = boto3.client("bedrock-runtime", region_name=settings.aws_region)
    body = json.dumps({"texts": [text], "input_type": "search_query"})
    resp = client.invoke_model(modelId=settings.embed_model, body=body)
    payload = json.loads(resp["body"].read())
    return payload["embeddings"][0]
