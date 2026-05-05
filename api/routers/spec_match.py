# api/routers/spec_match.py — Scenario D: spec → candidate components
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.search import get_search
from api.services.reranker import rerank

router = APIRouter(tags=["spec_match"])


class SpecRequest(BaseModel):
    requirements: str  # natural language: "8 inch QHD display module for AutoCockpit C7"
    target_product_id: Optional[str] = None
    top_n: int = 5


@router.post("/spec-match")
def spec_match(req: SpecRequest = Body(...)) -> dict:
    hits = get_search().hybrid_search(req.requirements, top_n=req.top_n * 3)
    docs = [{"id": h["_id"], "text": h["_source"].get("text", ""), **h["_source"]} for h in hits]
    return {"candidates": rerank(req.requirements, docs, top_n=req.top_n)}
