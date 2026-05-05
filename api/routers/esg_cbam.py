# api/routers/esg_cbam.py — Scenario K
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune
from api.services.carbon_calc import cbam_calc

router = APIRouter(tags=["esg_cbam"])


class EsgRequest(BaseModel):
    plant_id: Optional[str] = None


@router.post("/esg")
def esg(req: EsgRequest = Body(...)) -> dict:
    nep = get_neptune()
    plant_filter = "{id: $id}" if req.plant_id else ""
    rows = nep.run_cypher(
        f"MATCH (p:Plant{plant_filter})-[:EMITS]->(c:CarbonScope) "
        "RETURN p.id AS plant_id, p.region AS region, c.scope AS scope, c.co2e_tons AS tons "
        "ORDER BY p.id, c.scope",
        {"id": req.plant_id} if req.plant_id else {},
    )
    summary = {}
    for r in rows:
        pid = r["plant_id"]
        summary.setdefault(pid, {"region": r["region"], "scope_1": 0, "scope_2": 0, "scope_3": 0})
        summary[pid][f"scope_{r['scope']}"] = r["tons"]
    return {"plants": summary,
            "cbam_steel_per_100t_eur": cbam_calc(cn_code="7208", tons=100)}
