# api/services/lane_router.py
"""Lane reroute simulator for regulatory events (IRA / USMCA / CBAM).

Algorithm:
1. Find lanes in current graph subject to the violating regulation
2. For each affected (origin, dest) destination, find alternative lanes that
   satisfy the new rule (e.g. MX->US instead of CN->US for IRA-30D)
3. Return delta: lanes_to_drop + new_lanes + cost_impact
"""
from __future__ import annotations
from api.services.neptune import get_neptune


_EVENT_TO_REGULATION = {
    "IRA_2026": "IRA-30D",
    "USMCA_2025": "USMCA-Auto75",
    "CBAM_2026": "CBAM",
}


def simulate_reroute(event: str = "IRA_2026", scope: str | None = None) -> dict:
    reg_id = _EVENT_TO_REGULATION.get(event, event)
    neptune = get_neptune()
    affected = neptune.run_cypher(
        "MATCH (l:TradeLane)-[:SUBJECT_TO]->(:Regulation {id: $rid}) "
        "RETURN l.id AS id, l.origin_region AS origin_region, l.dest_region AS dest_region, "
        "l.transit_days AS transit_days, l.regulations AS regulations",
        {"rid": reg_id},
    )
    if not affected:
        return {"event": event, "lanes_to_drop": [], "new_lanes": [], "cost_impact_eur": 0.0}

    dests = list({a["dest_region"] for a in affected})
    candidates = neptune.run_cypher(
        "MATCH (l:TradeLane) WHERE l.dest_region IN $dests "
        "AND NOT (l)-[:SUBJECT_TO]->(:Regulation {id: $rid}) "
        "RETURN l.id AS id, l.origin_region AS origin_region, l.dest_region AS dest_region, "
        "l.transit_days AS transit_days, l.regulations AS regulations",
        {"dests": dests, "rid": reg_id},
    )
    return {
        "event": event,
        "regulation": reg_id,
        "lanes_to_drop": affected,
        "new_lanes": candidates,
        "cost_impact_eur": 0.0,  # set by caller using carbon_calc / customs estimates
    }
