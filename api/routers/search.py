"""Scenario A — Semantic Search."""
from __future__ import annotations
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.search import get_search
from api.services.reranker import rerank
from api.services.neptune import get_neptune
from api.schemas import SearchResponse

router = APIRouter(tags=["search"])


class SearchRequest(BaseModel):
    q: str
    persona: str = "buyer"
    top_n: int = 10


@router.post("/search", response_model=SearchResponse)
def search(req: SearchRequest = Body(...)) -> dict:
    hits = get_search().hybrid_search(req.q, top_n=req.top_n * 2)
    docs = [{"id": h["_id"], "text": h["_source"].get("text", ""), **h["_source"]} for h in hits]
    reranked = rerank(req.q, docs, top_n=req.top_n)
    component_ids = [d["id"] for d in reranked if d.get("label") == "Component"]
    subgraph = get_neptune().subgraph_for(component_ids[:5], hops=1) if component_ids else {"nodes": [], "edges": []}
    return {"hits": reranked, "subgraph": subgraph}
