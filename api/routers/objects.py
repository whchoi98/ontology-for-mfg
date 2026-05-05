"""Objects router — list Knowledge Graph nodes by label.

Security: `label` is validated against the 22-class ontology allowlist before
being used in any Cypher query. Cypher does not parameterize labels (unlike
SQL identifiers), so we MUST whitelist — string interpolation alone would
allow injection (e.g. `label=Component) DELETE n //`).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path, Query

# 22 ontology classes from spec § 8.1 — frozen set for O(1) lookup.
_ALLOWED_LABELS: frozenset[str] = frozenset({
    # BOM 계층 (4)
    "Product", "Module", "Component", "RawMaterial",
    # Supply 양면 (5)
    "Manufacturer", "Supplier", "SubSupplier", "CustomerAccount", "Plant",
    # Geo / 운송 (2)
    "Region", "TradeLane",
    # 표준 / 규제 (4)
    "Standard", "Certification", "Regulation", "Substance",
    # 품질 (3)
    "QualityIncident", "EightDReport", "RootCause",
    # 운영 / ESG (4)
    "Telemetry", "MaintenanceEvent", "ESGIndicator", "CarbonScope",
})


def _validate_label(label: str) -> str:
    if label not in _ALLOWED_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"unknown label '{label}'. Allowed: {sorted(_ALLOWED_LABELS)}",
        )
    return label


router = APIRouter(tags=["objects"])

try:
    from api.services.neptune import get_neptune

    @router.get("/objects/{label}")
    def list_objects(
        label: str = Path(..., description="Neptune node label, e.g. Component"),
        limit: int = Query(100, ge=1, le=500),
    ) -> dict:
        # Validate against allowlist BEFORE building the query.
        # Cypher labels can't be parameterized, so allowlist + literal is the only safe pattern.
        safe_label = _validate_label(label)
        rows = get_neptune().run_cypher(
            f"MATCH (n:{safe_label}) RETURN n LIMIT $lim",
            {"lim": limit},
        )
        items: list[dict] = []
        for r in rows:
            node = r.get("n", r)
            props = dict(node) if hasattr(node, "items") else {}
            item_id = props.pop("id", props.pop("node_id", str(len(items))))
            name = props.pop("name", props.pop("label", item_id))
            items.append({"id": item_id, "name": name, **props})
        return {"label": safe_label, "items": items, "total": len(items)}

except Exception:
    @router.get("/objects/{label}")
    def list_objects_stub(
        label: str = Path(...),
        limit: int = Query(100, ge=1, le=500),
    ) -> dict:
        safe_label = _validate_label(label)
        return {"label": safe_label, "items": [], "total": 0, "_stub": True}


@router.get("/objects")
def list_label_allowlist() -> dict:
    """Public catalog of allowed labels — used by UI Sidebar to enumerate KG objects."""
    return {"labels": sorted(_ALLOWED_LABELS), "count": len(_ALLOWED_LABELS)}
