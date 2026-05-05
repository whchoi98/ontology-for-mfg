# api/services/embedding.py
"""Text embedding via Bedrock.

Model is configured via MFG_EMBED_MODEL_ID env var (default: amazon.titan-embed-text-v2:0).
The AOSS mfg-search index was created with 1024 dimensions, which Titan v2 matches.

Response shape differences:
  - Titan v2: {"embedding": [...1024 floats...], "inputTextTokenCount": N}
  - Cohere embed-v4 (global): {"embeddings": {"float": [[...1536 floats...]]}, ...}
"""
from __future__ import annotations
import json
import logging
import boto3
from api.config import settings

log = logging.getLogger("mfg.embed")


def embed_text(text: str) -> list[float]:
    client = boto3.client("bedrock-runtime", region_name=settings.aws_region)
    model_id = settings.embed_model

    if "titan" in model_id:
        # Amazon Titan Embeddings v2: supports dimensions parameter
        body = json.dumps({"inputText": text, "dimensions": 1024, "normalize": True})
        resp = client.invoke_model(modelId=model_id, body=body)
        payload = json.loads(resp["body"].read())
        return payload["embedding"]

    if "cohere" in model_id:
        # Cohere embed-v4 (via global inference profile): returns {"embeddings": {"float": [[...]]}}
        body = json.dumps({"texts": [text], "input_type": "search_query"})
        resp = client.invoke_model(modelId=model_id, body=body)
        payload = json.loads(resp["body"].read())
        embeddings = payload.get("embeddings", {})
        if isinstance(embeddings, dict):
            return embeddings.get("float", [[]])[0]
        # Older response format: {"embeddings": [[...]]}
        return embeddings[0]

    # Generic fallback
    body = json.dumps({"inputText": text})
    resp = client.invoke_model(modelId=model_id, body=body)
    payload = json.loads(resp["body"].read())
    return payload.get("embedding") or payload.get("embeddings", [[]])[0]
