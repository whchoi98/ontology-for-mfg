"""Scenario A — Semantic Search."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Body
from pydantic import BaseModel

from api.routers.objects import _synthesize_subgraph

# Deterministic fallbacks shared with the sibling scenarios (D spec-match
# candidates, object-explorer 1-hop neighbourhood) so the page never blanks.
from api.routers.spec_match import _synthesize_candidates
from api.schemas import SearchResponse
from api.services.neptune import get_neptune
from api.services.reranker import rerank
from api.services.search import get_search

router = APIRouter(tags=["search"])
log = logging.getLogger("mfg.search")


class SearchRequest(BaseModel):
    q: str
    persona: str = "buyer"
    top_n: int = 10


def _synthetic_subgraph(component_id: str | None) -> dict:
    if not component_id:
        return {"nodes": [], "edges": []}
    nodes, edges, _ = _synthesize_subgraph("Component", component_id)
    return {"nodes": nodes, "edges": edges}


@router.post("/search", response_model=SearchResponse)
def search(req: SearchRequest = Body(...)) -> dict:
    synthetic = False
    try:
        hits = get_search().hybrid_search(req.q, top_n=req.top_n * 2)
        docs = [
            {"id": h["_id"], "text": h["_source"].get("text", ""), **h["_source"]} for h in hits
        ]
        reranked = rerank(req.q, docs, top_n=req.top_n)
    except Exception as e:
        # AOSS unreachable / 403 / no credentials → deterministic candidates.
        log.warning("hybrid_search failed, using synthetic hits: %s", e)
        reranked = _synthesize_candidates(req.q, max(1, req.top_n))
        synthetic = True

    component_ids = [d["id"] for d in reranked if d.get("label") == "Component"]
    subgraph: dict = {"nodes": [], "edges": []}
    if component_ids:
        if synthetic:
            subgraph = _synthetic_subgraph(component_ids[0])
        else:
            try:
                subgraph = get_neptune().subgraph_for(component_ids[:5], hops=1)
            except Exception as e:
                log.warning("Neptune subgraph failed, using synthetic neighbourhood: %s", e)
                subgraph = _synthetic_subgraph(component_ids[0])
                synthetic = True
    return {"hits": reranked, "subgraph": subgraph, "_synthetic": synthetic}
