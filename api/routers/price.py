# api/routers/price.py — Scenario G: price/availability/lead-time across suppliers
from __future__ import annotations
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune

router = APIRouter(tags=["price"])


class PriceRequest(BaseModel):
    component_id: str


@router.post("/price")
def price(req: PriceRequest = Body(...)) -> dict:
    rows = get_neptune().run_cypher(
        "MATCH (c:Component {id: $id})-[r:SUPPLIED_BY]->(s:Supplier) "
        "RETURN s.id AS supplier_id, s.name AS supplier_name, s.region AS region, "
        "r.leadtime AS leadtime_days, r.otd AS otd "
        "ORDER BY r.leadtime ASC",
        {"id": req.component_id},
    )
    return {"component_id": req.component_id, "offers": rows}
