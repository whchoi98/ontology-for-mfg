# api/routers/pdm.py — Scenario L: PdM/IoT live thresholds
from __future__ import annotations
import random
from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune

router = APIRouter(tags=["pdm"])


class PdmRequest(BaseModel):
    plant_id: Optional[str] = None


@router.post("/pdm")
def pdm(req: PdmRequest = Body(...)) -> dict:
    nep = get_neptune()
    rows = nep.run_cypher(
        "MATCH (t:Telemetry)-[:FROM]->(p:Plant) "
        + ("WHERE p.id = $id " if req.plant_id else "")
        + "RETURN t.sensor_id AS sensor_id, t.metric AS metric, t.unit AS unit, p.id AS plant_id "
        "LIMIT 50",
        {"id": req.plant_id} if req.plant_id else {},
    )
    rng = random.Random(42)
    alerts = []
    for r in rows[:5]:
        # Synthetic spike to trigger demo alarm
        value = rng.uniform(0.8, 1.5)
        if value > 1.2:
            alerts.append({**r, "value": round(value, 2), "threshold": 1.2,
                           "ts": (datetime.utcnow() - timedelta(minutes=rng.randint(1, 60))).isoformat()})
    return {"sensors": rows[:50], "alerts": alerts}
