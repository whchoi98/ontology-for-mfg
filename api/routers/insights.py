# api/routers/insights.py — Scenario C: Buyer/Quality insights via Code Interpreter
from __future__ import annotations
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune

router = APIRouter(tags=["insights"])


class InsightsRequest(BaseModel):
    question: str
    persona: str = "buyer"
    period_weeks: int = 12


@router.post("/insights")
def insights(req: InsightsRequest = Body(...)) -> dict:
    nep = get_neptune()
    rows = nep.run_cypher(
        "MATCH (s:Supplier) RETURN s.id AS id, s.name AS name, "
        "s.rfm_recency AS otd, s.rfm_frequency AS quality, s.rfm_monetary AS responsiveness "
        "ORDER BY otd DESC LIMIT 20",
        {},
    )
    summary = (f"지난 {req.period_weeks}주간 1차 협력사 평균 OTD: "
               f"{sum(r.get('otd', 0) for r in rows)/max(len(rows),1):.2%}")
    return {"summary": summary, "rows": rows, "chart_hint": "bar"}
