# api/services/reranker.py
"""Bedrock Reranker (Cohere rerank-v3-5) with graceful fallback.

If the configured rerank model is not available in the current region,
falls back to RRF-ordered results with a fake rerank_score based on position.
"""
from __future__ import annotations
import json
import logging
from api.aws_clients import bedrock_runtime
from api.config import settings

log = logging.getLogger("mfg.reranker")


def rerank(query: str, documents: list[dict], top_n: int = 10,
            text_key: str = "text") -> list[dict]:
    if not documents:
        return []
    try:
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
    except Exception as exc:
        log.warning("reranker unavailable (%s) — returning RRF order", exc)
        # Fallback: assign pseudo-scores from position and return top_n
        result = []
        for i, doc in enumerate(documents[:top_n]):
            d = dict(doc)
            d["rerank_score"] = max(0.0, 1.0 - i * (1.0 / max(top_n, 1)))
            result.append(d)
        return result
