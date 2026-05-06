# api/routers/price.py — Scenario G: price/availability/lead-time across suppliers
from __future__ import annotations
import logging
import random
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune

router = APIRouter(tags=["price"])
log = logging.getLogger("mfg.price")


class PriceRequest(BaseModel):
    component_id: str


def _synthesize_offers(component_id: str) -> list[dict]:
    rng = random.Random(component_id)
    suppliers = ["Hanwha", "Daesun", "Sunwoo", "BlueOcean", "Vertex"]
    regions = ["KR", "CN", "VN", "MX", "PL"]
    base_price = round(rng.uniform(0.8, 12.5), 2)
    out = []
    for i, (name, region) in enumerate(zip(suppliers, regions)):
        out.append({
            "supplier_id": f"AMZN-SUP1-{(i + 1) * 7:03d}",
            "supplier_name": f"{name} Industries",
            "region": region,
            "leadtime_days": rng.randint(5, 35),
            "otd": round(rng.uniform(0.82, 0.99), 3),
            "unit_price_usd": round(base_price * rng.uniform(0.85, 1.20), 3),
            "moq": rng.choice([100, 500, 1000, 5000]),
            "stock_units": rng.randint(0, 50000),
            "stock_status": rng.choice(["충분", "충분", "부족", "주문생산", "긴급재고"]),
        })
    out.sort(key=lambda x: (x["leadtime_days"], x["unit_price_usd"]))
    return out


@router.post("/price")
def price(req: PriceRequest = Body(...)) -> dict:
    offers: list[dict] = []
    try:
        rows = get_neptune().run_cypher(
            "MATCH (c:Component {id: $id})-[r:SUPPLIED_BY]->(s:Supplier) "
            "RETURN s.id AS supplier_id, s.name AS supplier_name, s.region AS region, "
            "r.leadtime AS leadtime_days, r.otd AS otd "
            "ORDER BY r.leadtime ASC",
            {"id": req.component_id},
        )
        offers = rows or []
    except Exception as e:
        log.warning("Neptune SUPPLIED_BY query failed: %s", e)
        offers = []

    synthetic = False
    if not offers:
        # SUPPLIED_BY edges weren't loaded by Plan 1 — synthesize 5 realistic offers
        offers = _synthesize_offers(req.component_id)
        synthetic = True

    # Compute summary stats for the UI
    if offers:
        leadtimes = [o.get("leadtime_days", 0) for o in offers]
        prices = [o.get("unit_price_usd", 0) for o in offers if o.get("unit_price_usd")]
        otds = [o.get("otd", 0) for o in offers if o.get("otd")]
        summary = {
            "min_leadtime_days": min(leadtimes) if leadtimes else None,
            "max_leadtime_days": max(leadtimes) if leadtimes else None,
            "min_unit_price_usd": min(prices) if prices else None,
            "max_unit_price_usd": max(prices) if prices else None,
            "avg_otd": round(sum(otds) / len(otds), 3) if otds else None,
            "supplier_count": len(offers),
        }
    else:
        summary = {"supplier_count": 0}

    return {
        "component_id": req.component_id,
        "offers": offers,
        "summary": summary,
        "_synthetic": synthetic,
    }
