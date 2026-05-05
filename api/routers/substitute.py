# api/routers/substitute.py — Scenario F: same-spec alternative parts
from __future__ import annotations
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune

router = APIRouter(tags=["substitute"])


class SubstituteRequest(BaseModel):
    component_id: str
    top_n: int = 5


@router.post("/substitute")
def substitute(req: SubstituteRequest = Body(...)) -> dict:
    nep = get_neptune()
    rows = nep.run_cypher(
        "MATCH (c:Component {id: $id})-[:CONFORMS_TO]->(s:Standard)<-[:CONFORMS_TO]-(alt:Component) "
        "WHERE c.id <> alt.id "
        "RETURN DISTINCT alt.id AS id, alt.name AS name, alt.category AS category, "
        "collect(DISTINCT s.id) AS shared_standards "
        "LIMIT $top",
        {"id": req.component_id, "top": req.top_n},
    )
    return {"original_id": req.component_id, "candidates": rows}
