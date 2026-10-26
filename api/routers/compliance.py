# api/routers/compliance.py — Scenario E: REACH/RoHS/AEC-Q live check
from __future__ import annotations

import logging
import random

from fastapi import APIRouter, Body
from pydantic import BaseModel

from api.schemas import ComplianceResponse
from api.services.compliance_engine import check_component
from api.services.neptune import get_neptune, list_prop
from data.schemas import Component

router = APIRouter(tags=["compliance"])
log = logging.getLogger("mfg.compliance")


class ComplianceRequest(BaseModel):
    component_id: str | None = None
    component: Component | None = None


_DEMO_SUBSTANCE_POOL = [
    "7439-92-1",  # Lead — RoHS
    "117-81-7",  # DEHP — REACH SVHC + RoHS
    "7440-43-9",  # Cadmium — RoHS
    "7439-97-6",  # Mercury — RoHS
    "84-69-5",  # DIBP — REACH SVHC
    "1303-86-2",  # Boric acid — REACH SVHC
]

# Unrestricted constituents for the "clean" synthetic half. An empty list
# would now read as insufficient_data, so clean demo parts declare benign
# substances instead (none of these are on the SVHC / RoHS lists).
_BENIGN_SUBSTANCE_POOL = [
    "7440-31-5",  # Tin
    "7429-90-5",  # Aluminium
    "7440-22-4",  # Silver
    "7440-21-3",  # Silicon
]


def _synthesize_component(component_id: str) -> Component:
    """Deterministic synthetic component when Neptune doesn't have one with this id.
    Seeds substances based on the id so the demo can show both compliant and violating cases."""
    rng = random.Random(component_id)
    # ~50% problematic to make demo interesting
    if rng.random() < 0.5:
        substances = rng.sample(_DEMO_SUBSTANCE_POOL, k=rng.randint(1, 2))
    else:
        substances = rng.sample(_BENIGN_SUBSTANCE_POOL, k=rng.randint(1, 2))

    cat = "IC"
    if "PCB" in component_id.upper():
        cat = "PCB"
    elif "MEC" in component_id.upper() or "CON" in component_id.upper():
        cat = "Mechanical"
    elif "DIS" in component_id.upper():
        cat = "Display"

    standards = {
        "IC": ["AEC-Q100", "JESD22"],
        "PCB": ["IPC-A-610", "IPC-J-STD-001"],
        "Mechanical": ["ISO-9001"],
        "Display": ["JESD51"],
    }.get(cat, ["ISO-9001"])

    return Component(
        id=component_id,
        name=f"{cat} 부품 {component_id[-5:]}",
        category=cat,
        substances=substances,
        standards=standards,
    )


def evaluate_component(
    component_id: str | None = None,
    component: Component | None = None,
    extra_substances: list[str] | None = None,
) -> dict:
    """Lookup (Neptune → synthetic fallback) + deterministic check.

    Shared by the /compliance router and the chat `compliance_check` tool so
    both see the same component data. `extra_substances` are CAS ids the
    caller wants checked in addition to the component's own declaration.
    """
    comp = component
    synthetic = False

    if comp is None and component_id:
        try:
            rows = get_neptune().run_cypher(
                "MATCH (c:Component {id: $id}) RETURN c.id AS id, c.name AS name, "
                "c.category AS category, c.substances AS substances, c.standards AS standards",
                {"id": component_id},
            )
        except Exception as e:
            log.warning("Neptune component lookup failed: %s", e)
            rows = []

        if rows:
            r = rows[0]
            try:
                comp = Component(
                    id=r.get("id") or component_id,
                    name=r.get("name") or "Unknown",
                    category=r.get("category") or "IC",
                    substances=list_prop(r.get("substances")),
                    standards=list_prop(r.get("standards")),
                )
            except Exception as e:
                log.warning("Component parse failed: %s", e)
                comp = None

    if comp is None and component_id:
        comp = _synthesize_component(component_id)
        synthetic = True

    if comp is None:
        return {
            "status": "invalid_input",
            "compliant": False,
            "violations": [
                {
                    "regulation": "INPUT",
                    "substance": "?",
                    "severity": "INFO",
                    "message": "component_id 또는 component 객체가 필요합니다.",
                }
            ],
            "component_id": None,
            "_error": "component not provided",
        }

    extra = [str(x) for x in (extra_substances or []) if x]
    if extra:
        merged = list(dict.fromkeys([*comp.substances, *extra]))
        comp = comp.model_copy(update={"substances": merged})

    result = check_component(comp)
    if result["status"] == "insufficient_data":
        result["message"] = (
            "부품의 물질(CAS) 선언 데이터가 없어 REACH-SVHC / RoHS 적합 여부를 "
            "판정할 수 없습니다 (데이터 없음 ≠ 적합)."
        )
    # Enrich the response so the UI has more context
    return {
        **result,
        "component": {
            "id": comp.id,
            "name": comp.name,
            "category": comp.category,
            "substances": list(comp.substances),
            "standards": list(comp.standards),
        },
        "_synthetic": synthetic,
        # Substance lists are evaluated; standards are only echoed as
        # declared — qualification (AEC-Q / JEDEC) is not verified here.
        "checked_against": {
            "REACH-SVHC": bool(comp.substances),
            "RoHS": bool(comp.substances),
            "AEC-Q100": "AEC-Q100" in comp.standards,
            "JESD22": "JESD22" in comp.standards,
        },
    }


@router.post("/compliance", response_model=ComplianceResponse)
def compliance(req: ComplianceRequest = Body(...)) -> dict:
    return evaluate_component(req.component_id, req.component)
