# api/routers/supplier_rfm.py — Scenario I: 1차/2차 협력사 RFM 점수
from __future__ import annotations
import random
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune
from api.services.rfm_scorer import rank_suppliers

router = APIRouter(tags=["supplier_rfm"])

_REGIONS = ["KR", "CN", "VN", "MX", "PL", "US", "IN"]
_PREFIXES = ["Hanwha", "Daesun", "Sunwoo", "BlueOcean", "Kornic", "Vertex",
              "Apex", "Synthon", "Pacific", "Beacon", "Quantum", "Helio"]


class RfmRequest(BaseModel):
    tier: int = 1
    top_n: int = 20


def _synthesize_suppliers(tier: int) -> list[dict]:
    rng = random.Random(f"tier-{tier}")
    out: list[dict] = []
    for i in range(1, 21):
        out.append({
            "id": f"AMZN-SUP{tier}-{i:03d}",
            "name": f"{rng.choice(_PREFIXES)} Industries {i}",
            "region": rng.choice(_REGIONS),
            "otd_pct": round(rng.uniform(0.78, 0.99), 3),
            "defect_ppm": round(rng.uniform(40, 800), 0),
            "response_hours": round(rng.uniform(2, 36), 1),
        })
    return out


from api.schemas import SupplierRfmResponse


@router.post("/supplier-rfm", response_model=SupplierRfmResponse)
def rfm(req: RfmRequest = Body(...)) -> dict:
    label = "Supplier" if req.tier == 1 else "SubSupplier"

    rows: list[dict] = []
    try:
        rows = get_neptune().run_cypher(
            f"MATCH (s:{label}) RETURN s.id AS id, s.name AS name, s.region AS region, "
            "s.rfm_recency AS otd_pct, s.rfm_frequency AS quality, s.rfm_monetary AS responsiveness "
            "LIMIT 100",
            {},
        )
    except Exception:
        rows = []

    norm: list[dict] = []
    if rows:
        for r in rows:
            norm.append({
                "id": r.get("id") or "?",
                "name": r.get("name") or "?",
                "region": r.get("region") or "KR",
                "otd_pct": float(r.get("otd_pct") or 0.9),
                "defect_ppm": (1.0 - float(r.get("quality") or 0.9)) * 1000,
                "response_hours": (1.0 - float(r.get("responsiveness") or 0.9)) * 48,
            })

    synthetic = False
    if not norm:
        norm = _synthesize_suppliers(req.tier)
        synthetic = True

    ranked = rank_suppliers(norm)
    return {"tier": req.tier, "ranked": ranked[: req.top_n], "_synthetic": synthetic}
