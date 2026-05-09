# api/routers/price.py — Scenario G: price/availability/lead-time across suppliers (retail-style)
"""G 단가/재고 비교 — 부품 → 협력사별 단가/재고/리드타임 매트릭스 + 추천 best supplier."""
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


_SUPPLIER_PREFIXES = ["Hanwha", "Daesun", "Sunwoo", "BlueOcean", "Vertex",
                      "Apex", "Synthon", "Pacific", "Beacon", "Quantum"]


def _category_for(component_id: str) -> str:
    cid = component_id.upper()
    if "PCB" in cid: return "PCB"
    if "MOT" in cid: return "Motor"
    if "DIS" in cid: return "Display"
    if "CON" in cid: return "Connector"
    if "MEC" in cid: return "Mechanical"
    return "IC"


def _synthesize_offers(component_id: str) -> list[dict]:
    rng = random.Random(component_id)
    suppliers = ["Hanwha", "Daesun", "Sunwoo", "BlueOcean", "Vertex"]
    regions = ["KR", "CN", "VN", "MX", "PL"]
    base_price = round(rng.uniform(0.8, 12.5), 2)
    out = []
    for i, (name, region) in enumerate(zip(suppliers, regions)):
        unit = round(base_price * rng.uniform(0.85, 1.20), 3)
        leadtime = rng.randint(5, 35)
        otd = round(rng.uniform(0.82, 0.99), 3)
        moq = rng.choice([100, 500, 1000, 5000])
        stock = rng.randint(0, 50000)
        defect_ppm = rng.randint(40, 800)
        out.append({
            "supplier_id": f"AMZN-SUP1-{(i + 1) * 7:03d}",
            "supplier_name": f"{name} Industries",
            "region": region,
            "leadtime_days": leadtime,
            "otd": otd,
            "unit_price_usd": unit,
            "price_delta_pct": round((unit - base_price) / base_price * 100, 1) if base_price else 0,
            "moq": moq,
            "stock_units": stock,
            "stock_status": rng.choice(["충분", "충분", "부족", "주문생산", "긴급재고"]),
            "defect_ppm": defect_ppm,
            "tier": 1,
        })
    out.sort(key=lambda x: (x["leadtime_days"], x["unit_price_usd"]))
    return out


def _score_offers(offers: list[dict]) -> list[dict]:
    """Simple composite — favors low price, low leadtime, high OTD."""
    if not offers:
        return offers
    min_p = min(o["unit_price_usd"] for o in offers)
    max_p = max(o["unit_price_usd"] for o in offers)
    min_lt = min(o["leadtime_days"] for o in offers)
    max_lt = max(o["leadtime_days"] for o in offers)
    for o in offers:
        p_norm = 1 - (o["unit_price_usd"] - min_p) / max(1e-6, max_p - min_p)  # 1 best (lowest price)
        lt_norm = 1 - (o["leadtime_days"] - min_lt) / max(1e-6, max_lt - min_lt)  # 1 best (shortest)
        otd_norm = o["otd"]
        composite = round(p_norm * 35 + lt_norm * 30 + otd_norm * 35, 1)
        o["composite_score"] = composite
    return offers


def _build_subgraph(component_id: str, category: str, offers: list[dict]) -> dict:
    nodes: list[dict] = [{
        "data": {"id": component_id, "label": "Component", "name_ko": f"{category} {component_id[-5:]}", "name": component_id}
    }]
    edges: list[dict] = []
    seen_regions: set[str] = set()
    for i, o in enumerate(offers):
        sid = o["supplier_id"]
        nodes.append({"data": {
            "id": sid, "label": "Supplier",
            "name_ko": o["supplier_name"], "name": o["supplier_name"],
            "region": o["region"], "otd": o["otd"], "leadtime_days": o["leadtime_days"],
        }})
        edges.append({"data": {
            "id": f"e_offer_{i}", "source": component_id, "target": sid, "type": "SUPPLIED_BY",
        }})
        rid = f"REG-{o['region']}"
        if rid not in seen_regions:
            nodes.append({"data": {"id": rid, "label": "Region", "name_ko": o["region"], "name": o["region"]}})
            seen_regions.add(rid)
        edges.append({"data": {"id": f"e_loc_{i}", "source": sid, "target": rid, "type": "LOCATED_IN"}})
    return {"nodes": nodes, "edges": edges}


from api.schemas import PriceResponse


@router.post("/price", response_model=PriceResponse)
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
        offers = _synthesize_offers(req.component_id)
        synthetic = True

    offers = _score_offers(offers)

    cat = _category_for(req.component_id)
    rng = random.Random(req.component_id)
    original = {
        "id": req.component_id,
        "name": f"{cat} 부품 {req.component_id[-5:]}",
        "category": cat,
        "current_supplier": offers[0]["supplier_name"] if offers else None,
        "current_unit_price_usd": offers[0]["unit_price_usd"] if offers else None,
        "monthly_demand_units": rng.randint(500, 50000),
    }

    leadtimes = [o["leadtime_days"] for o in offers]
    prices = [o["unit_price_usd"] for o in offers]
    otds = [o["otd"] for o in offers]
    summary = {
        "supplier_count": len(offers),
        "min_leadtime_days": min(leadtimes) if leadtimes else 0,
        "max_leadtime_days": max(leadtimes) if leadtimes else 0,
        "min_unit_price_usd": min(prices) if prices else 0,
        "max_unit_price_usd": max(prices) if prices else 0,
        "avg_otd": round(sum(otds) / len(otds), 3) if otds else 0,
        "best_supplier_id": max(offers, key=lambda x: x.get("composite_score", 0))["supplier_id"] if offers else None,
        "best_supplier_name": max(offers, key=lambda x: x.get("composite_score", 0))["supplier_name"] if offers else None,
    }

    subgraph = _build_subgraph(req.component_id, cat, offers)

    return {
        "original": original,
        "offers": offers,
        "subgraph": subgraph,
        "summary": summary,
        "_synthetic": synthetic,
        "_summary": (
            f"`{req.component_id}` — {len(offers)}개 협력사, 단가 ${summary['min_unit_price_usd']:.2f}~${summary['max_unit_price_usd']:.2f}, "
            f"리드타임 {summary['min_leadtime_days']}~{summary['max_leadtime_days']}일. "
            f"종합 추천: {summary['best_supplier_name']}"
        ),
    }
