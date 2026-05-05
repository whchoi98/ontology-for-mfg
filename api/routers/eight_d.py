# api/routers/eight_d.py — Scenario J
from __future__ import annotations
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune
from api.services.eight_d_writer import draft_eight_d
from api.services.kb import retrieve_kb

router = APIRouter(tags=["eight_d"])


class EightDRequest(BaseModel):
    incident_id: str


@router.post("/eight-d")
def eight_d(req: EightDRequest = Body(...)) -> dict:
    nep = get_neptune()
    inc_rows = nep.run_cypher(
        "MATCH (i:QualityIncident {id: $id}) RETURN i.id AS id, i.title AS title, "
        "i.component_id AS component_id, i.plant_id AS plant_id, i.severity AS severity",
        {"id": req.incident_id},
    )
    if not inc_rows:
        return {"error": "incident not found"}
    inc = inc_rows[0]
    similar = [r["content"]["text"] for r in retrieve_kb(inc["title"], top_k=3)]
    draft = draft_eight_d(incident_title=inc["title"], incident_desc=inc.get("severity", ""),
                          similar_reports=similar, standards=["JESD22", "AEC-Q100"])
    # Rough RootCause graph (placeholder until proper subgraph built)
    return {"incident": inc, "eight_d": draft, "similar_count": len(similar)}
