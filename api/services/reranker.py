# api/services/reranker.py
"""Bedrock Reranker (Cohere rerank-v3-5) Cross-Region Inference Profile."""
from __future__ import annotations
import json
from api.aws_clients import bedrock_runtime
from api.config import settings


def rerank(query: str, documents: list[dict], top_n: int = 10,
            text_key: str = "text") -> list[dict]:
    if not documents:
        return []
    body = json.dumps({
        "query": query,
        "documents": [d.get(text_key, "") for d in documents],
        "top_n": top_n,
        "api_version": 2,
    })
    resp = bedrock_runtime().invoke_model(modelId=settings.rerank_model, body=body)
    payload = json.loads(resp["body"].read())
    out: list[dict] = []
    for r in payload.get("results", []):
        idx = r["index"]
        if 0 <= idx < len(documents):
            doc = dict(documents[idx])
            doc["rerank_score"] = r.get("relevance_score", 0.0)
            out.append(doc)
    return out
