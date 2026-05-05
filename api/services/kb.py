# api/services/kb.py
"""Bedrock Knowledge Base retrieve."""
from __future__ import annotations
from api.aws_clients import bedrock_agent_runtime
from api.config import settings


def retrieve_kb(query: str, kb_id: str | None = None, top_k: int = 5) -> list[dict]:
    kb_id = kb_id or settings.bedrock_kb_id
    if not kb_id:
        return []
    resp = bedrock_agent_runtime().retrieve(
        knowledgeBaseId=kb_id,
        retrievalQuery={"text": query},
        retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": top_k}},
    )
    return resp.get("retrievalResults", [])
