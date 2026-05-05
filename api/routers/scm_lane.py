# api/routers/scm_lane.py — Scenario H: global lane visualization + reroute simulation
from __future__ import annotations
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune
from api.services.lane_router import simulate_reroute
from api.services.carbon_calc import cbam_calc

router = APIRouter(tags=["scm_lane"])


class LaneRerouteRequest(BaseModel):
    event: str = "IRA_2026"


@router.get("/lane")
def list_lanes() -> dict:
    rows = get_neptune().run_cypher(
        "MATCH (l:TradeLane) RETURN l.id AS id, l.origin_region AS origin, "
        "l.dest_region AS dest, l.mode AS mode, l.transit_days AS days, "
        "l.regulations AS regulations LIMIT 200",
        {},
    )
    return {"lanes": rows}


@router.post("/lane/reroute")
def reroute(req: LaneRerouteRequest = Body(...)) -> dict:
    sim = simulate_reroute(event=req.event)
    # Naive cost impact: assume 100 t steel shifted
    sim["cbam_fee_eur_per_100t_steel"] = cbam_calc(cn_code="7208", tons=100)
    return sim
