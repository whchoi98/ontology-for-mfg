# api/routers/spec_match.py — Scenario D: spec → candidate components
from __future__ import annotations
import logging
import random
from typing import Optional
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.search import get_search
from api.services.reranker import rerank

router = APIRouter(tags=["spec_match"])
log = logging.getLogger("mfg.spec_match")


class SpecRequest(BaseModel):
    requirements: str
    target_product_id: Optional[str] = None
    top_n: int = 5


def _synthesize_candidates(requirements: str, top_n: int) -> list[dict]:
    rng = random.Random(requirements)
    cat = "Display"
    if "BGA" in requirements.upper() or "IC" in requirements.upper() or "MCU" in requirements.upper():
        cat = "IC"
    elif "MOTOR" in requirements.upper() or "INVERTER" in requirements.upper() or "EDRIVE" in requirements.upper():
        cat = "Motor"
    elif "PCB" in requirements.upper():
        cat = "PCB"

    cat_standards = {
        "IC":      ["AEC-Q100", "JESD22"],
        "Display": ["JESD51", "AEC-Q100"],
        "Motor":   ["IATF-16949", "ISO-26262"],
        "PCB":     ["IPC-A-610", "IPC-J-STD-001"],
    }.get(cat, ["ISO-9001"])

    suppliers = ["Hanwha", "Daesun", "BlueOcean", "Vertex", "Apex", "Synthon", "Pacific"]
    out: list[dict] = []
    for i in range(1, top_n + 1):
        cid = f"AMZN-CMP-{cat[:3].upper()}-{rng.randint(10000, 99999):05d}"
        score = round(rng.uniform(0.65, 0.96), 3)
        out.append({
            "id": cid,
            "name": f"{rng.choice(suppliers)} {cat}-{rng.randint(100, 999)}",
            "category": cat,
            "label": "Component",
            "rerank_score": score,
            "match_score": score,
            "shared_standards": cat_standards,
            "leadtime_days": rng.randint(7, 30),
            "supplier_otd": round(rng.uniform(0.85, 0.99), 3),
            "rohs_compliant": rng.random() < 0.85,
            "key_specs": [
                f"동작온도 {rng.choice(['-40°C ~ +85°C', '-40°C ~ +105°C', '-25°C ~ +85°C'])}",
                f"패키지 {rng.choice(['BGA-256', 'BGA-484', 'QFN-48', 'TQFP-64'])}",
                f"인증 {', '.join(cat_standards[:2])}",
            ],
        })
    out.sort(key=lambda x: -x["rerank_score"])
    return out


@router.post("/spec-match")
def spec_match(req: SpecRequest = Body(...)) -> dict:
    candidates: list[dict] = []
    try:
        hits = get_search().hybrid_search(req.requirements, top_n=req.top_n * 3)
        if hits:
            docs = [
                {"id": h["_id"], "text": h["_source"].get("text", ""), **h["_source"]}
                for h in hits
            ]
            candidates = rerank(req.requirements, docs, top_n=req.top_n)
    except Exception as e:
        log.warning("hybrid_search/rerank failed: %s", e)
        candidates = []

    synthetic = False
    if not candidates:
        candidates = _synthesize_candidates(req.requirements, req.top_n)
        synthetic = True

    # Build a small subgraph from the candidates so the frontend can render it.
    # Center node = "Spec" virtual node; connect to each candidate; each candidate
    # connects to its shared standards.
    nodes: list[dict] = [{"data": {
        "id": "SPEC-VIRTUAL",
        "label": "Spec",
        "name_ko": (req.requirements or "스펙")[:24],
        "name": (req.requirements or "스펙")[:24],
    }}]
    edges: list[dict] = []
    seen_std_ids: set[str] = set()
    for i, c in enumerate(candidates):
        cid = c.get("id", f"CMP-{i}")
        nodes.append({"data": {
            "id": cid,
            "label": "Component",
            "name_ko": c.get("name") or cid,
            "name": c.get("name") or cid,
            "category": c.get("category"),
            "rerank_score": c.get("rerank_score"),
        }})
        edges.append({"data": {
            "id": f"e_spec_{i}",
            "source": "SPEC-VIRTUAL",
            "target": cid,
            "type": "MATCHES",
        }})
        for std in (c.get("shared_standards") or []):
            std_id = f"STD-{std}"
            if std_id not in seen_std_ids:
                nodes.append({"data": {
                    "id": std_id,
                    "label": "Standard",
                    "name_ko": std,
                    "name": std,
                }})
                seen_std_ids.add(std_id)
            edges.append({"data": {
                "id": f"e_{cid}_{std}",
                "source": cid,
                "target": std_id,
                "type": "CONFORMS_TO",
            }})

    return {
        "requirements": req.requirements,
        "target_product_id": req.target_product_id,
        "candidates": candidates,
        "subgraph": {"nodes": nodes, "edges": edges},
        "_synthetic": synthetic,
        "_summary": (
            f"`{req.requirements[:60]}` 요구사항에 매칭되는 후보 {len(candidates)}개 "
            f"(rerank 점수 내림차순). 인증·리드타임·OTD를 함께 비교하세요."
        ),
    }
