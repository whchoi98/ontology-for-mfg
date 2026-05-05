# api/routers/supplier_rfm.py — Scenario I: 1차/2차 협력사 RFM 점수
from __future__ import annotations
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune
from api.services.rfm_scorer import rank_suppliers

router = APIRouter(tags=["supplier_rfm"])


class RfmRequest(BaseModel):
    tier: int = 1
    top_n: int = 20


@router.post("/supplier-rfm")
def rfm(req: RfmRequest = Body(...)) -> dict:
    label = "Supplier" if req.tier == 1 else "SubSupplier"
    rows = get_neptune().run_cypher(
        f"MATCH (s:{label}) RETURN s.id AS id, s.name AS name, s.region AS region, "
        "s.rfm_recency AS otd_pct, s.rfm_frequency AS quality, s.rfm_monetary AS responsiveness",
        {},
    )
    # Convert raw data into scorer inputs
    norm = []
    for r in rows:
        norm.append({
            "id": r["id"], "name": r["name"], "region": r["region"],
            "otd_pct": r.get("otd_pct", 0.9),
            "defect_ppm": (1.0 - r.get("quality", 0.9)) * 1000,
            "response_hours": (1.0 - r.get("responsiveness", 0.9)) * 48,
        })
    ranked = rank_suppliers(norm)
    return {"tier": req.tier, "ranked": ranked[: req.top_n]}
