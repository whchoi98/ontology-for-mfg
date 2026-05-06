# api/routers/compliance.py — Scenario E: REACH/RoHS/AEC-Q live check
from __future__ import annotations
import logging
import random
from typing import Optional
from fastapi import APIRouter, Body
from pydantic import BaseModel
from data.schemas import Component
from api.services.compliance_engine import check_component
from api.services.neptune import get_neptune

router = APIRouter(tags=["compliance"])
log = logging.getLogger("mfg.compliance")


class ComplianceRequest(BaseModel):
    component_id: Optional[str] = None
    component: Optional[Component] = None


_DEMO_SUBSTANCE_POOL = [
    "7439-92-1",   # Lead — RoHS
    "117-81-7",    # DEHP — REACH SVHC + RoHS
    "7440-43-9",   # Cadmium — RoHS
    "7439-97-6",   # Mercury — RoHS
    "84-69-5",     # DIBP — REACH SVHC
    "1303-86-2",   # Boric acid — REACH SVHC
]


def _ensure_lists(value, default: list[str]) -> list[str]:
    """Neptune may return scalar/None instead of list for list-valued props."""
    if value is None:
        return default
    if isinstance(value, list):
        return [str(x) for x in value]
    return [str(value)] if value else default


def _synthesize_component(component_id: str) -> Component:
    """Deterministic synthetic component when Neptune doesn't have one with this id.
    Seeds substances based on the id so the demo can show both compliant and violating cases."""
    rng = random.Random(component_id)
    # ~50% problematic to make demo interesting
    if rng.random() < 0.5:
        substances = rng.sample(_DEMO_SUBSTANCE_POOL, k=rng.randint(1, 2))
    else:
        substances = []

    cat = "IC"
    if "PCB" in component_id.upper():
        cat = "PCB"
    elif "MEC" in component_id.upper() or "CON" in component_id.upper():
        cat = "Mechanical"
    elif "DIS" in component_id.upper():
        cat = "Display"

    standards = {
        "IC":         ["AEC-Q100", "JESD22"],
        "PCB":        ["IPC-A-610", "IPC-J-STD-001"],
        "Mechanical": ["ISO-9001"],
        "Display":    ["JESD51"],
    }.get(cat, ["ISO-9001"])

    return Component(
        id=component_id,
        name=f"{cat} 부품 {component_id[-5:]}",
        category=cat,
        substances=substances,
        standards=standards,
    )


@router.post("/compliance")
def compliance(req: ComplianceRequest = Body(...)) -> dict:
    comp = req.component
    synthetic = False

    if comp is None and req.component_id:
        try:
            rows = get_neptune().run_cypher(
                "MATCH (c:Component {id: $id}) RETURN c.id AS id, c.name AS name, "
                "c.category AS category, c.substances AS substances, c.standards AS standards",
                {"id": req.component_id},
            )
        except Exception as e:
            log.warning("Neptune component lookup failed: %s", e)
            rows = []

        if rows:
            r = rows[0]
            try:
                comp = Component(
                    id=r.get("id") or req.component_id,
                    name=r.get("name") or "Unknown",
                    category=r.get("category") or "IC",
                    substances=_ensure_lists(r.get("substances"), []),
                    standards=_ensure_lists(r.get("standards"), []),
                )
            except Exception as e:
                log.warning("Component parse failed: %s", e)
                comp = None

    if comp is None and req.component_id:
        comp = _synthesize_component(req.component_id)
        synthetic = True

    if comp is None:
        return {
            "compliant": False,
            "violations": [{"regulation": "INPUT", "substance": "?",
                              "severity": "INFO",
                              "message": "component_id 또는 component 객체가 필요합니다."}],
            "component_id": None,
            "_error": "component not provided",
        }

    result = check_component(comp)
    # Enrich the response so the UI has more context
    return {
        **result,
        "component": {
            "id": comp.id, "name": comp.name, "category": comp.category,
            "substances": list(comp.substances), "standards": list(comp.standards),
        },
        "_synthetic": synthetic,
        "checked_against": {
            "REACH-SVHC": True, "RoHS": True,
            "AEC-Q100": "AEC-Q100" in comp.standards,
            "JESD22": "JESD22" in comp.standards,
        },
    }
