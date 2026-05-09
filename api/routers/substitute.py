# api/routers/substitute.py — Scenario F: same-spec alternative parts (retail-style)
"""F 대체 부품 — 원본 부품에 대한 같은 사양 대체 후보 + 사용자가 고를 수 있는 sample 리스트.

Endpoints:
- GET  /api/substitute/samples?limit=N    — 좌측 picker용 후보 부품 리스트
- POST /api/substitute                    — 원본 부품 → 대체 후보 + 점수 + 그래프
"""
from __future__ import annotations
import logging
import random
from typing import Optional
from fastapi import APIRouter, Body, Query
from pydantic import BaseModel
from api.services.neptune import get_neptune

router = APIRouter(tags=["substitute"])
log = logging.getLogger("mfg.substitute")


class SubstituteRequest(BaseModel):
    component_id: str
    same_supplier_ok: bool = False
    top_n: int = 8


# ─────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────

_CAT_STANDARDS = {
    "IC":         ["AEC-Q100", "JESD22"],
    "PCB":        ["IPC-A-610", "IPC-J-STD-001"],
    "Connector":  ["IPC-WHMA-A-620"],
    "Mechanical": ["ISO-9001"],
    "Display":    ["JESD51", "AEC-Q100"],
    "Battery":    ["ISO-26262", "AEC-Q200"],
    "Sensor":     ["AEC-Q100", "JESD22"],
    "Power":      ["AEC-Q200", "ISO-9001"],
    "Motor":      ["IATF-16949", "ISO-9001"],
    "Memory":     ["JESD46", "JEP122"],
}

_SUPPLIER_PREFIXES = ["Hanwha", "Daesun", "Sunwoo", "BlueOcean", "Vertex",
                      "Apex", "Synthon", "Pacific", "Beacon", "Quantum"]


def _category_for(component_id: str) -> str:
    cid = component_id.upper()
    if "PCB" in cid: return "PCB"
    if "MOT" in cid: return "Motor"
    if "DIS" in cid: return "Display"
    if "CON" in cid: return "Connector"
    if "MEC" in cid: return "Mechanical"
    if "BAT" in cid: return "Battery"
    if "SEN" in cid: return "Sensor"
    if "POW" in cid: return "Power"
    if "MEM" in cid: return "Memory"
    return "IC"


def _synth_original(component_id: str) -> dict:
    rng = random.Random(component_id)
    cat = _category_for(component_id)
    return {
        "id": component_id,
        "name": f"{cat} 부품 {component_id[-5:]}",
        "category": cat,
        "supplier_id": f"AMZN-SUP1-{rng.randint(1, 100):03d}",
        "supplier_name": f"{rng.choice(_SUPPLIER_PREFIXES)} Industries",
        "unit_price_usd": round(rng.uniform(0.8, 12.0), 2),
        "leadtime_days": rng.randint(7, 30),
        "rohs_compliant": rng.random() < 0.85,
        "standards": _CAT_STANDARDS.get(cat, ["ISO-9001"]),
        "stock_status": rng.choice(["충분", "충분", "부족", "주문생산"]),
    }


def _synth_candidates(original: dict, top_n: int, same_supplier_ok: bool) -> list[dict]:
    rng = random.Random(original["id"] + "/cand")
    cat = original["category"]
    base_price = original["unit_price_usd"]
    base_stds = set(original["standards"])

    out: list[dict] = []
    for i in range(top_n):
        # Vary supplier — distinct from original unless same_supplier_ok
        sup_idx = (i + 1) % len(_SUPPLIER_PREFIXES)
        sup_name = _SUPPLIER_PREFIXES[sup_idx]
        sup_id = f"AMZN-SUP1-{((i + 7) * 13) % 100 + 1:03d}"
        if not same_supplier_ok and sup_id == original["supplier_id"]:
            sup_id = f"AMZN-SUP1-{((i + 11) * 17) % 100 + 1:03d}"

        alt_id = f"AMZN-CMP-{cat[:3].upper()}-{rng.randint(10000, 99999):05d}"
        unit_price = round(base_price * rng.uniform(0.78, 1.28), 2)
        leadtime = rng.randint(5, 35)
        rohs = rng.random() < 0.85
        # Shared standards (subset of base + maybe extras)
        cat_alts = _CAT_STANDARDS.get(cat, ["ISO-9001"])
        shared = list(base_stds.intersection(cat_alts))
        if not shared:
            shared = cat_alts[:1]
        # Synthesize a few extra "shared specs" for variety
        spec_tags = []
        if cat in ("IC", "Sensor"):
            spec_tags.append(rng.choice(["-40°C ~ +85°C", "-40°C ~ +105°C", "-25°C ~ +85°C"]))
            spec_tags.append(rng.choice(["BGA-256", "BGA-484", "QFN-48", "TQFP-64"]))
        elif cat in ("Display",):
            spec_tags.append(rng.choice(["8\"", "10.1\"", "12.3\"", "15.6\""]))
            spec_tags.append(rng.choice(["QHD", "FHD", "HD"]))

        # Score: 100 base, deduct for price/leadtime delta, add for shared standards count
        price_delta_pct = round(((unit_price - base_price) / base_price) * 100, 1) if base_price else 0
        score = 100 - abs(price_delta_pct) * 0.5 - max(0, leadtime - original["leadtime_days"]) * 1.0 + len(shared) * 5
        if not rohs and original["rohs_compliant"]:
            score -= 15
        score = max(40, min(100, round(score, 1)))

        out.append({
            "id": alt_id,
            "name": f"{sup_name} {cat}-{rng.randint(100, 999)}",
            "category": cat,
            "supplier_id": sup_id,
            "supplier_name": f"{sup_name} Industries",
            "unit_price_usd": unit_price,
            "price_delta_pct": price_delta_pct,
            "leadtime_days": leadtime,
            "leadtime_delta_days": leadtime - original["leadtime_days"],
            "rohs_compliant": rohs,
            "shared_standards": shared,
            "spec_tags": spec_tags,
            "stock_status": rng.choice(["충분", "충분", "부족", "주문생산"]),
            "score": score,
        })

    out.sort(key=lambda c: -c["score"])
    return out


def _build_subgraph(original: dict, candidates: list[dict]) -> dict:
    """Original + Standards + Candidate alternatives — color-coded subgraph."""
    nodes: list[dict] = [{
        "data": {
            "id": original["id"],
            "label": "Component",
            "name_ko": original["name"],
            "name": original["name"],
        }
    }]
    edges: list[dict] = []
    seen_std: set[str] = set()
    for std in original["standards"]:
        sid = f"STD-{std}"
        if sid not in seen_std:
            nodes.append({"data": {"id": sid, "label": "Standard", "name_ko": std, "name": std}})
            seen_std.add(sid)
        edges.append({"data": {"id": f"e_orig_{std}", "source": original["id"], "target": sid, "type": "CONFORMS_TO"}})
    for i, c in enumerate(candidates):
        nodes.append({
            "data": {
                "id": c["id"], "label": "Component",
                "name_ko": c["name"], "name": c["name"],
                "score": c["score"],
            }
        })
        for std in c["shared_standards"]:
            sid = f"STD-{std}"
            if sid not in seen_std:
                nodes.append({"data": {"id": sid, "label": "Standard", "name_ko": std, "name": std}})
                seen_std.add(sid)
            edges.append({"data": {"id": f"e_{c['id']}_{std}_{i}", "source": c["id"], "target": sid, "type": "CONFORMS_TO"}})
    return {"nodes": nodes, "edges": edges}


# ─────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────

@router.get("/substitute/samples")
def samples(limit: int = Query(15, ge=1, le=50)) -> dict:
    """Return a list of base components for the left picker."""
    items: list[dict] = []
    try:
        rows = get_neptune().run_cypher(
            "MATCH (c:Component) RETURN c.id AS id, c.name AS name, c.category AS category LIMIT $lim",
            {"lim": limit},
        )
        for r in rows:
            cid = r.get("id")
            if not cid:
                continue
            items.append({
                "id": cid,
                "name": r.get("name") or cid,
                "category": r.get("category") or _category_for(cid),
            })
    except Exception as e:
        log.warning("Neptune samples query failed: %s", e)

    if not items:
        cats = list(_CAT_STANDARDS.keys())
        for i in range(limit):
            cat = cats[i % len(cats)]
            items.append({
                "id": f"AMZN-CMP-{cat[:3].upper()}-{i+1:05d}",
                "name": f"{cat} 부품 {i+1:05d}",
                "category": cat,
            })

    # Add "rich" properties to make the picker visually rich
    rng = random.Random("samples")
    for it in items:
        it["leadtime_days"] = rng.randint(7, 30)
        it["unit_price_usd"] = round(rng.uniform(0.8, 12.0), 2)

    return {"items": items, "total": len(items), "_synthetic": True}


from api.schemas import SubstituteResponse


@router.post("/substitute", response_model=SubstituteResponse)
def substitute(req: SubstituteRequest = Body(...)) -> dict:
    # Original component lookup
    original: Optional[dict] = None
    try:
        rows = get_neptune().run_cypher(
            "MATCH (c:Component {id: $id}) RETURN c.id AS id, c.name AS name, "
            "c.category AS category, c.standards AS standards LIMIT 1",
            {"id": req.component_id},
        )
        if rows:
            r = rows[0]
            stds = r.get("standards") or []
            if isinstance(stds, str):
                stds = [stds]
            original = {
                "id": r.get("id") or req.component_id,
                "name": r.get("name") or req.component_id,
                "category": r.get("category") or _category_for(req.component_id),
                "standards": stds or _CAT_STANDARDS.get(_category_for(req.component_id), ["ISO-9001"]),
                "supplier_id": "AMZN-SUP1-007",
                "supplier_name": "Hanwha Industries",
                "unit_price_usd": round(random.Random(req.component_id).uniform(1.0, 10.0), 2),
                "leadtime_days": random.Random(req.component_id + "/lt").randint(7, 30),
                "rohs_compliant": True,
                "stock_status": "충분",
            }
    except Exception as e:
        log.warning("Neptune original lookup failed: %s", e)

    if original is None:
        original = _synth_original(req.component_id)

    candidates = _synth_candidates(original, req.top_n, req.same_supplier_ok)
    subgraph = _build_subgraph(original, candidates)

    summary = {
        "min_price_delta_pct": min((c["price_delta_pct"] for c in candidates), default=0),
        "max_price_delta_pct": max((c["price_delta_pct"] for c in candidates), default=0),
        "rohs_compliant_count": sum(1 for c in candidates if c["rohs_compliant"]),
        "fastest_leadtime_days": min((c["leadtime_days"] for c in candidates), default=0),
    }

    return {
        "original": original,
        "candidates": candidates,
        "subgraph": subgraph,
        "summary": summary,
        "_synthetic": True,
        "_summary": (
            f"`{req.component_id}` 와 동일 사양 후보 {len(candidates)}개 — "
            f"가격 편차 {summary['min_price_delta_pct']}% ~ {summary['max_price_delta_pct']}%, "
            f"RoHS 통과 {summary['rohs_compliant_count']}/{len(candidates)}"
        ),
    }
