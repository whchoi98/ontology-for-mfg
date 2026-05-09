# api/routers/pdm.py — Scenario L: PdM/IoT live thresholds
from __future__ import annotations
import random
from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune

router = APIRouter(tags=["pdm"])

_METRICS = [
    ("vibration_rms_g", "g"), ("temp_c", "°C"), ("current_a", "A"),
    ("voltage_v", "V"), ("pressure_kpa", "kPa"), ("rpm", "rpm"),
]


class PdmRequest(BaseModel):
    plant_id: Optional[str] = None


def _synthesize_sensors(plant_id: Optional[str]) -> list[dict]:
    n = 30
    out: list[dict] = []
    for i in range(1, n + 1):
        metric, unit = _METRICS[i % len(_METRICS)]
        out.append({
            "sensor_id": f"AMZN-SENSOR-{i:05d}",
            "metric": metric,
            "unit": unit,
            "plant_id": plant_id or f"AMZN-PLANT-{(i % 12) + 1:03d}",
        })
    return out


from api.schemas import PdmResponse


@router.post("/pdm", response_model=PdmResponse)
def pdm(req: PdmRequest = Body(...)) -> dict:
    nep = get_neptune()
    rows: list[dict] = []
    try:
        rows = nep.run_cypher(
            "MATCH (t:Telemetry)" + ("-[:FROM]->(p:Plant)" if req.plant_id else "") + " "
            + ("WHERE p.id = $id " if req.plant_id else "")
            + ("RETURN t.sensor_id AS sensor_id, t.metric AS metric, t.unit AS unit, p.id AS plant_id "
               if req.plant_id else
               "RETURN t.sensor_id AS sensor_id, t.metric AS metric, t.unit AS unit, t.plant_id AS plant_id ")
            + "LIMIT 50",
            {"id": req.plant_id} if req.plant_id else {},
        )
    except Exception:
        rows = []

    synthetic = False
    if not rows:
        rows = _synthesize_sensors(req.plant_id)
        synthetic = True

    rng = random.Random(42)
    alerts = []
    for r in rows[:8]:
        # Bias toward producing 3-5 visible alerts
        value = rng.uniform(0.8, 1.6)
        if value > 1.15:
            alerts.append({
                **r,
                "value": round(value, 2),
                "threshold": 1.2,
                "ts": (datetime.utcnow() - timedelta(minutes=rng.randint(1, 60))).isoformat(),
            })

    return {"sensors": rows[:50], "alerts": alerts, "_synthetic": synthetic}
