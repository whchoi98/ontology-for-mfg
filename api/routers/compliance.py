# api/routers/compliance.py — Scenario E: REACH/RoHS/AEC-Q live check
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Body
from pydantic import BaseModel
from data.schemas import Component
from api.services.compliance_engine import check_component
from api.services.neptune import get_neptune

router = APIRouter(tags=["compliance"])


class ComplianceRequest(BaseModel):
    component_id: Optional[str] = None
    component: Optional[Component] = None


@router.post("/compliance")
def compliance(req: ComplianceRequest = Body(...)) -> dict:
    comp = req.component
    if comp is None and req.component_id:
        rows = get_neptune().run_cypher(
            "MATCH (c:Component {id: $id}) RETURN c.id AS id, c.name AS name, "
            "c.category AS category, c.substances AS substances, c.standards AS standards",
            {"id": req.component_id},
        )
        if rows:
            r = rows[0]
            comp = Component(id=r["id"], name=r["name"], category=r["category"],
                             substances=r.get("substances") or [],
                             standards=r.get("standards") or [])
    if comp is None:
        return {"error": "component not found"}
    return check_component(comp)
