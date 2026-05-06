# api/routers/scm_lane.py — Scenario H: global lane visualization + reroute simulation
from __future__ import annotations
import logging
import random
from itertools import product
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune
from api.services.lane_router import simulate_reroute
from api.services.carbon_calc import cbam_calc

router = APIRouter(tags=["scm_lane"])
log = logging.getLogger("mfg.scm_lane")

_REGIONS = ["KR", "CN", "VN", "MX", "PL", "US", "IN"]
_MODES = ["SEA", "AIR", "RAIL", "ROAD"]


class LaneRerouteRequest(BaseModel):
    event: str = "IRA_2026"


def _synthesize_lanes() -> list[dict]:
    rng = random.Random("lanes-seed")
    pairs = [(o, d) for o, d in product(_REGIONS, _REGIONS) if o != d]
    rng.shuffle(pairs)
    out: list[dict] = []
    lid = 0
    while len(out) < 60:
        for o, d in pairs:
            if len(out) >= 60:
                break
            mode = rng.choice(_MODES)
            regs: list[str] = []
            if d == "US" and o == "MX":
                regs.append("USMCA-Auto75")
            if d == "US" and o == "CN":
                regs.append("IRA-30D")
            if d == "PL":
                regs.append("CBAM")
            transit = {"SEA": 25, "AIR": 3, "RAIL": 18, "ROAD": 7}[mode] + rng.randint(-2, 4)
            lid += 1
            out.append({
                "id": f"AMZN-LANE-{lid:04d}",
                "origin": o, "dest": d, "mode": mode,
                "days": max(2, transit), "regulations": regs,
            })
    return out


@router.get("/lane")
def list_lanes() -> dict:
    lanes: list[dict] = []
    try:
        rows = get_neptune().run_cypher(
            "MATCH (l:TradeLane) RETURN l.id AS id, l.origin_region AS origin, "
            "l.dest_region AS dest, l.mode AS mode, l.transit_days AS days, "
            "l.regulations AS regulations LIMIT 200",
            {},
        )
        lanes = rows or []
    except Exception as e:
        log.warning("Neptune TradeLane query failed: %s", e)
        lanes = []

    synthetic = False
    if not lanes:
        lanes = _synthesize_lanes()
        synthetic = True

    # Normalise — Neptune may return regulations as None or a string
    for ln in lanes:
        regs = ln.get("regulations")
        if regs is None:
            ln["regulations"] = []
        elif isinstance(regs, str):
            ln["regulations"] = [regs] if regs else []

    # Lightweight per-region counts so the frontend can display KPIs alongside the map
    from collections import Counter
    by_dest = Counter(ln["dest"] for ln in lanes)
    by_mode = Counter(ln["mode"] for ln in lanes)
    flagged = sum(1 for ln in lanes if ln["regulations"])

    return {
        "lanes": lanes,
        "summary": {
            "total": len(lanes),
            "by_dest": dict(by_dest),
            "by_mode": dict(by_mode),
            "regulation_flagged": flagged,
        },
        "_synthetic": synthetic,
    }


@router.post("/lane/reroute")
def reroute(req: LaneRerouteRequest = Body(...)) -> dict:
    sim: dict
    try:
        sim = simulate_reroute(event=req.event)
    except Exception as e:
        log.warning("simulate_reroute failed: %s", e)
        sim = {}

    # Defensive defaults so the UI always has structure
    if not sim or not sim.get("lanes_to_drop") and not sim.get("new_lanes"):
        # Synthesize a reroute event so demo can show change
        rng = random.Random(req.event)
        evt_to_reg = {"IRA_2026": "IRA-30D", "USMCA_2025": "USMCA-Auto75", "CBAM_2026": "CBAM"}
        reg = evt_to_reg.get(req.event, "IRA-30D")

        # 2 dropped + 2 new lanes
        dropped = [
            {"id": f"AMZN-LANE-DROP-{i:03d}", "origin": "CN", "dest": "US",
              "mode": "SEA", "days": 26, "regulations": [reg]}
            for i in range(1, 3)
        ]
        new_lanes = [
            {"id": f"AMZN-LANE-NEW-{i:03d}",
              "origin": "MX", "dest": "US",
              "mode": "ROAD", "days": rng.randint(4, 10),
              "regulations": ["USMCA-Auto75"]}
            for i in range(1, 3)
        ]
        sim = {
            "event": req.event,
            "regulation": reg,
            "lanes_to_drop": dropped,
            "new_lanes": new_lanes,
            "_synthetic": True,
        }

    sim["cbam_fee_eur_per_100t_steel"] = cbam_calc(cn_code="7208", tons=100)
    sim["impact_summary"] = (
        f"`{sim.get('event', req.event)}` 발효: "
        f"{len(sim.get('lanes_to_drop', []))}개 lane 영향, "
        f"{len(sim.get('new_lanes', []))}개 대체 lane 제안. "
        f"CBAM 100t 강재 부담 ≈ €{sim['cbam_fee_eur_per_100t_steel']:,.0f}."
    )
    return sim
