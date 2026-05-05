"""Objects router — list Knowledge Graph nodes by label."""
from __future__ import annotations

from fastapi import APIRouter, Path, Query

router = APIRouter(tags=["objects"])

try:
    from api.services.neptune import get_neptune

    @router.get("/objects/{label}")
    def list_objects(
        label: str = Path(..., description="Neptune node label, e.g. Component"),
        limit: int = Query(100, ge=1, le=500),
    ) -> dict:
        rows = get_neptune().run_cypher(
            f"MATCH (n:{label}) RETURN n LIMIT $lim",
            {"lim": limit},
        )
        # Normalise each row to {id, name, ...props}
        items: list[dict] = []
        for r in rows:
            node = r.get("n", r)
            props = dict(node) if hasattr(node, "items") else {}
            item_id = props.pop("id", props.pop("node_id", str(len(items))))
            name = props.pop("name", props.pop("label", item_id))
            items.append({"id": item_id, "name": name, **props})
        return {"label": label, "items": items, "total": len(items)}

except Exception:
    # Neptune not configured in dev — return empty list so UI still renders
    @router.get("/objects/{label}")
    def list_objects_stub(
        label: str = Path(...),
        limit: int = Query(100, ge=1, le=500),
    ) -> dict:
        return {"label": label, "items": [], "total": 0, "_stub": True}
