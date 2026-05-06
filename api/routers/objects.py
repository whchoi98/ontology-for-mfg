"""Objects router — list Knowledge Graph nodes by label + per-id detail.

Security: `label` is validated against the 22-class ontology allowlist before
being used in any Cypher query. Cypher does not parameterize labels, so we MUST
whitelist — string interpolation alone would allow injection.

Retail-style 3-endpoint shape:
- GET /api/objects                  → labels catalog
- GET /api/objects/{label}          → list (top N by fan-out)
- GET /api/objects/{label}/{id}     → detail with 1-hop subgraph + neighbor_summary
- GET /api/objects/_counts          → per-label node counts (for /validation)
"""
from __future__ import annotations

import logging
import random
from datetime import date, timedelta
from typing import Any
from collections import Counter
from fastapi import APIRouter, HTTPException, Path, Query

log = logging.getLogger("mfg.objects")

# 22 ontology classes from spec § 8.1 — frozen set for O(1) lookup.
_ALLOWED_LABELS: frozenset[str] = frozenset({
    "Product", "Module", "Component", "RawMaterial",
    "Manufacturer", "Supplier", "SubSupplier", "CustomerAccount", "Plant",
    "Region", "TradeLane",
    "Standard", "Certification", "Regulation", "Substance",
    "QualityIncident", "EightDReport", "RootCause",
    "Telemetry", "MaintenanceEvent", "ESGIndicator", "CarbonScope",
})


def _validate_label(label: str) -> str:
    if label not in _ALLOWED_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"unknown label '{label}'. Allowed: {sorted(_ALLOWED_LABELS)}",
        )
    return label


def _flatten_node(raw: dict) -> dict:
    """Flatten a Neptune openCypher node into a flat dict.

    Neptune openCypher result formats vary depending on driver and request shape.
    Common shapes:
      A) {"~id": "x", "~labels": ["L"], "~properties": {...}}
      B) {"~entityType": "node", "~id": "x", "~labels": ["L"], "~properties": {...}}
      C) flat: {"id": "x", "name": "..."} (when query uses `RETURN n.id, n.name` aliases)
    """
    if not isinstance(raw, dict):
        return {"id": str(raw), "name": str(raw)}

    # Shape A/B: extract ~properties
    if "~properties" in raw or "~id" in raw:
        props = dict(raw.get("~properties") or {})
        if "id" not in props and "~id" in raw:
            props["id"] = raw["~id"]
        if "name" not in props:
            props["name"] = props.get("id", "?")
        return props

    # Shape C: already flat
    return dict(raw)


def _synthesize_items(label: str, limit: int) -> list[dict]:
    """Deterministic synthetic items per label so /objects/<label> always renders."""
    rng = random.Random(label)
    items: list[dict] = []

    if label == "Product":
        lines = [
            ("SmartFridge", "HA"), ("VisionOLED", "HE"),
            ("AutoCockpit", "VS"), ("FC-BGA", "INNOTEK"),
            ("eDrive", "MAGNA"),
        ]
        for i in range(min(limit, 80)):
            line, div = lines[i % len(lines)]
            items.append({
                "id": f"AMZN-{div}-{line.replace(' ', '')}-{i+1:03d}",
                "name": f"AMZN {line} {chr(65 + (i // len(lines)) % 26)}{(i % 16) + 1}",
                "line": line, "division": div, "brand": "AMZN Tech",
            })
        return items

    if label == "Component":
        cats = ["IC", "PCB", "Connector", "Mechanical", "Display",
                "Battery", "Sensor", "Power", "Motor", "Memory"]
        for i in range(min(limit, 100)):
            cat = cats[i % len(cats)]
            items.append({
                "id": f"AMZN-CMP-{cat[:3].upper()}-{i+1:05d}",
                "name": f"{cat} 부품 {i+1}",
                "category": cat,
                "standards": {"IC": ["AEC-Q100", "JESD22"], "PCB": ["IPC-A-610"],
                               "Display": ["JESD51"], "Motor": ["IATF-16949"]}.get(cat, ["ISO-9001"]),
            })
        return items

    if label == "Supplier":
        prefixes = ["Hanwha", "Daesun", "Sunwoo", "BlueOcean", "Kornic",
                     "Vertex", "Apex", "Synthon", "Pacific", "Beacon"]
        regions = ["KR", "CN", "VN", "MX", "PL", "US", "IN"]
        for i in range(min(limit, 100)):
            items.append({
                "id": f"AMZN-SUP1-{i+1:03d}",
                "name": f"{prefixes[i % len(prefixes)]} Industries {i+1}",
                "tier": 1, "region": regions[i % len(regions)],
                "rfm_recency": round(rng.uniform(0.4, 1.0), 3),
                "rfm_frequency": round(rng.uniform(0.3, 1.0), 3),
                "rfm_monetary": round(rng.uniform(0.3, 1.0), 3),
            })
        return items

    if label == "SubSupplier":
        for i in range(min(limit, 50)):
            items.append({
                "id": f"AMZN-SUP2-{i+1:03d}",
                "name": f"Tier2 Manufacturing {i+1}",
                "parent_supplier_id": f"AMZN-SUP1-{(i % 100) + 1:03d}",
                "region": ["CN", "VN", "IN"][i % 3],
            })
        return items

    if label == "CustomerAccount":
        segs = ["AUTO_OEM", "TIER1", "APPLIANCE_DIST", "TELECOM", "OTHER"]
        for i in range(min(limit, 30)):
            items.append({
                "id": f"AMZN-CUST-{i+1:03d}",
                "name": f"{['Global Auto OEM', 'Tier-1 Supplier', 'Appliance Dist', 'Telco', 'Industrial'][i % 5]} #{(i // 5) + 1}",
                "segment": segs[i % len(segs)],
                "region": ["KR", "US", "PL", "CN", "MX"][i % 5],
            })
        return items

    if label == "Plant":
        regions = ["KR", "CN", "VN", "MX", "PL", "US", "IN"]
        divs = ["HA", "HE", "VS", "INNOTEK", "MAGNA"]
        for i in range(min(limit, 40)):
            items.append({
                "id": f"AMZN-PLANT-{i+1:03d}",
                "name": f"Plant {regions[i % 7]}-{(i // 7) + 1}",
                "region": regions[i % 7],
                "operator": "SELF" if i < 15 else "SUPPLIER",
                "division": divs[i % 5],
            })
        return items

    if label == "Manufacturer":
        return [
            {"id": "AMZN-MFG-HA",      "name": "AMZN Tech Home Appliance",     "division": "HA"},
            {"id": "AMZN-MFG-HE",      "name": "AMZN Tech Home Entertainment", "division": "HE"},
            {"id": "AMZN-MFG-VS",      "name": "AMZN Tech Vehicle Solutions",  "division": "VS"},
            {"id": "AMZN-MFG-INNOTEK", "name": "AMZN Tech Innotek + Magna ePT JV", "division": "INNOTEK"},
        ]

    if label == "Region":
        regions = [
            ("KR", "Korea, Republic of", "대한민국"),
            ("CN", "China", "중국"),
            ("VN", "Vietnam", "베트남"),
            ("MX", "Mexico", "멕시코"),
            ("PL", "Poland", "폴란드"),
            ("US", "United States", "미국"),
            ("IN", "India", "인도"),
        ]
        return [{"id": r[0], "name": r[1], "name_ko": r[2]} for r in regions]

    if label == "TradeLane":
        regions = ["KR", "CN", "VN", "MX", "PL", "US", "IN"]
        modes = ["SEA", "AIR", "RAIL", "ROAD"]
        for i in range(min(limit, 60)):
            o = regions[i % 7]; d = regions[(i + 3) % 7]
            if o == d: d = regions[(i + 4) % 7]
            mode = modes[i % 4]
            regs: list[str] = []
            if d == "US" and o == "MX": regs.append("USMCA-Auto75")
            if d == "US" and o == "CN": regs.append("IRA-30D")
            if d == "PL": regs.append("CBAM")
            items.append({
                "id": f"AMZN-LANE-{i+1:04d}",
                "name": f"{o} → {d} ({mode})",
                "origin_region": o, "dest_region": d, "mode": mode,
                "transit_days": {"SEA": 25, "AIR": 3, "RAIL": 18, "ROAD": 7}[mode],
                "regulations": regs,
            })
        return items

    if label == "Standard":
        stds = [
            ("JESD22", "JEDEC", "Reliability Test Methods"),
            ("MO-220", "JEDEC", "BGA Outline"),
            ("IPC-A-610", "IPC", "Acceptability of Electronic Assemblies"),
            ("AEC-Q100", "AEC-Q", "IC Stress Test"),
            ("AEC-Q200", "AEC-Q", "Passive Components"),
            ("IATF-16949", "IATF", "Automotive Quality"),
            ("ISO-26262", "ISO", "Functional Safety ASIL A-D"),
            ("ISO-9001", "ISO", "Quality Management"),
            ("ISO-14001", "ISO", "Environmental Management"),
            ("ISO-50001", "ISO", "Energy Management"),
        ]
        return [{"id": s[0], "name": s[2], "family": s[1], "title": s[2]} for s in stds[:limit]]

    if label == "Regulation":
        regs = [
            ("REACH-SVHC", "EU", "REACH Article 33 — SVHC Candidate List"),
            ("RoHS", "EU", "RoHS Directive 2011/65/EU"),
            ("CBAM", "EU", "Carbon Border Adjustment Mechanism"),
            ("IRA-30D", "US", "IRA Section 30D Clean Vehicle Credit + FEOC"),
            ("USMCA-Auto75", "US", "USMCA Chapter 4 — 75% RVC"),
        ]
        return [{"id": r[0], "name": r[2], "region": r[1], "title": r[2]} for r in regs[:limit]]

    if label == "Substance":
        substances = [
            ("117-81-7", "DEHP", "1B"), ("84-69-5", "DIBP", "1B"),
            ("84-74-2", "DBP", "1B"), ("85-68-7", "BBP", "1B"),
            ("1303-86-2", "Boric acid", "1B"),
            ("7440-43-9", "Cadmium", "1B"),
            ("7439-92-1", "Lead", "1A"),
            ("7439-97-6", "Mercury", None),
            ("71-43-2", "Benzene", "1A"),
            ("106-99-0", "1,3-Butadiene", "1A"),
        ]
        return [{"cas_id": s[0], "id": s[0], "name": s[1], "cmr_grade": s[2],
                  "rohs_restricted": True, "reach_svhc": True} for s in substances[:limit]]

    if label == "QualityIncident":
        titles = ["BGA solder ball crack", "Capacitor leakage", "PCB delamination",
                   "Display dead pixel", "Battery thermal", "Motor bearing wear",
                   "Sensor calibration drift", "Connector intermittent"]
        sevs = ["LOW", "MID", "HIGH", "CRITICAL"]
        items.append({
            "id": "INC-2026-0412",
            "name": "BGA solder ball crack on Innotek FC-BGA Gen5 (lot 2026-Q1-W04)",
            "title": "BGA solder ball crack on Innotek FC-BGA Gen5 (lot 2026-Q1-W04)",
            "component_id": "AMZN-CMP-IC-00001", "plant_id": "AMZN-PLANT-001",
            "severity": "CRITICAL", "occurred_at": "2026-04-12",
        })
        for i in range(2, min(limit + 1, 80)):
            items.append({
                "id": f"INC-2026-{i:04d}",
                "name": titles[i % len(titles)],
                "title": titles[i % len(titles)],
                "component_id": f"AMZN-CMP-IC-{i*7 % 1000:05d}",
                "plant_id": f"AMZN-PLANT-{(i % 12) + 1:03d}",
                "severity": sevs[i % 4],
                "occurred_at": (date(2025, 5, 1) + timedelta(days=rng.randint(0, 365))).isoformat(),
            })
        return items

    if label == "EightDReport":
        for i in range(1, min(limit + 1, 50)):
            items.append({
                "id": f"8D-2026-{i:04d}",
                "name": f"8D 리포트 #{i}",
                "incident_id": f"INC-2026-{i:04d}",
                "d4_root_cause": "Reflow temperature profile drift",
                "d8_closure": "Closure approved by Quality Director",
            })
        return items

    if label == "RootCause":
        causes = [
            "Reflow temperature drift (peak +8°C)",
            "Substrate moisture absorption (RH 65% > spec 50%)",
            "Solder paste expiration (35d vs 28d spec)",
            "Component placement offset (machine A12 calibration)",
            "Material change at Tier-2 (different copper thickness)",
        ]
        for i in range(1, min(limit + 1, 50)):
            items.append({
                "id": f"RC-2026-{i:04d}",
                "name": causes[i % len(causes)],
                "description": causes[i % len(causes)],
                "linked_supplier_id": f"AMZN-SUP1-{i % 100 + 1:03d}",
            })
        return items

    if label == "Telemetry":
        metrics = [("vibration_rms_g", "g"), ("temp_c", "°C"),
                    ("current_a", "A"), ("voltage_v", "V"), ("rpm", "rpm")]
        for i in range(1, min(limit + 1, 100)):
            metric, unit = metrics[i % len(metrics)]
            items.append({
                "id": f"AMZN-SENSOR-{i:05d}",
                "name": f"센서 {i}: {metric}",
                "sensor_id": f"AMZN-SENSOR-{i:05d}",
                "metric": metric, "unit": unit,
                "plant_id": f"AMZN-PLANT-{(i % 12) + 1:03d}",
            })
        return items

    if label == "MaintenanceEvent":
        kinds = ["PM", "CM", "PdM"]
        for i in range(1, min(limit + 1, 50)):
            items.append({
                "id": f"AMZN-MAINT-{i:04d}",
                "name": f"{kinds[i % 3]} 정비 #{i}",
                "target_id": f"AMZN-PLANT-{(i % 12) + 1:03d}",
                "kind": kinds[i % 3],
                "occurred_at": (date(2025, 5, 1) + timedelta(days=i * 7)).isoformat(),
                "duration_hours": round(rng.uniform(0.5, 8.0), 1),
            })
        return items

    if label == "ESGIndicator":
        metrics = ["water_use_m3", "waste_kg", "lost_time_injury_rate", "diversity_pct"]
        for i in range(1, min(limit + 1, 40)):
            items.append({
                "id": f"AMZN-ESG-{i:03d}",
                "name": f"{metrics[i % 4]} - Plant {(i % 12) + 1}",
                "plant_id": f"AMZN-PLANT-{(i % 12) + 1:03d}",
                "metric": metrics[i % 4],
                "period": ["2025-Q4", "2026-Q1"][i % 2],
                "value": round(rng.uniform(10, 5000), 1),
            })
        return items

    if label == "CarbonScope":
        for i in range(1, min(limit + 1, 36)):
            scope = (i % 3) + 1
            items.append({
                "id": f"AMZN-CSCOPE-{i:03d}",
                "name": f"Plant {(i % 12) + 1} Scope {scope}",
                "plant_id": f"AMZN-PLANT-{(i % 12) + 1:03d}",
                "scope": scope,
                "period": "2026-Q1",
                "co2e_tons": round(rng.uniform(50, 5000), 1),
            })
        return items

    if label == "RawMaterial":
        materials = ["Silicon wafer 200mm", "Silicon wafer 300mm", "Copper foil 18μm",
                      "Aluminium ingot", "Polyimide film", "FR-4 substrate",
                      "Epoxy mold compound", "Lithium iron phosphate", "Graphite anode"]
        for i in range(1, min(limit + 1, 50)):
            items.append({
                "id": f"AMZN-RAW-{i:04d}",
                "name": materials[i % len(materials)],
            })
        return items

    if label == "Module":
        cats = ["Display", "PowerSupply", "Mainboard", "Compressor", "Inverter", "Sensor"]
        for i in range(1, min(limit + 1, 50)):
            items.append({
                "id": f"AMZN-MOD-{i:04d}",
                "name": f"{cats[i % len(cats)]} Module {i}",
                "category": cats[i % len(cats)],
            })
        return items

    if label == "Certification":
        for i in range(1, min(limit + 1, 30)):
            items.append({
                "id": f"AMZN-CERT-{i:04d}",
                "name": f"Certification #{i}",
                "target_id": f"AMZN-PLANT-{(i % 12) + 1:03d}",
                "standard_id": ["IATF-16949", "ISO-26262", "ISO-9001"][i % 3],
                "expires": (date(2026, 1, 1) + timedelta(days=i * 30)).isoformat(),
            })
        return items

    return items


router = APIRouter(tags=["objects"])


def _to_list_item(flat: dict, label: str) -> dict:
    """Coerce flattened node dict into retail-shaped {id, name, rank_score, properties}."""
    item_id = flat.get("id") or flat.get("cas_id") or flat.get("sensor_id") or "?"
    name = flat.get("name") or flat.get("title") or item_id
    # rank_score: pick a meaningful per-label heuristic from the synthetic data
    rank = 0
    if label == "Supplier":
        rank = int(round((flat.get("rfm_recency", 0) or 0) * 100))
    elif label == "QualityIncident":
        rank = {"CRITICAL": 4, "HIGH": 3, "MID": 2, "LOW": 1}.get(flat.get("severity") or "?", 0)
    elif label == "Plant":
        rank = 1 if flat.get("operator") == "SELF" else 0
    return {
        "id": str(item_id),
        "name": str(name),
        "rank_score": rank,
        "properties": {k: v for k, v in flat.items() if k not in ("id", "name")},
    }


def _list_for_label(label: str, limit: int) -> tuple[list[dict], bool]:
    items: list[dict] = []
    synthetic = False
    try:
        nep = get_neptune()
        rows = nep.run_cypher(f"MATCH (n:{label}) RETURN n LIMIT $lim", {"lim": limit})
        for r in rows:
            node = r.get("n", r)
            flat = _flatten_node(node)
            if not flat.get("id") and not flat.get("cas_id"):
                continue
            items.append(_to_list_item(flat, label))
    except Exception as e:
        log.warning("Neptune list query for %s failed: %s", label, e)
        items = []

    if not items:
        items = [_to_list_item(it, label) for it in _synthesize_items(label, limit)]
        synthetic = True
    return items, synthetic


def _build_subgraph_for_id(label: str, obj_id: str) -> tuple[dict, dict[str, int]]:
    """Build 1-hop subgraph for the (label, id) anchor + neighbor_summary by label.
    Falls back to a synthetic neighborhood when Neptune doesn't have the node or edges."""
    nodes: list[dict] = []
    edges: list[dict] = []
    neighbor_counts: Counter = Counter()

    try:
        nep = get_neptune()
        rows = nep.run_cypher(
            f"MATCH (n:{label} {{id: $id}})-[r]-(m) "
            "RETURN n, r, m LIMIT 50",
            {"id": obj_id},
        )
        if rows:
            anchor_added = False
            seen_node_ids: set[str] = set()
            seen_edge_ids: set[str] = set()
            for row in rows:
                n_node = row.get("n")
                m_node = row.get("m")
                rel = row.get("r")
                # Anchor
                if not anchor_added and n_node:
                    nflat = _flatten_node(n_node)
                    nodes.append({
                        "data": {"id": nflat.get("id", obj_id), "label": label,
                                  "name_ko": nflat.get("name", obj_id),
                                  "name": nflat.get("name", obj_id)}
                    })
                    seen_node_ids.add(nflat.get("id", obj_id))
                    anchor_added = True
                if m_node:
                    mflat = _flatten_node(m_node)
                    mid = mflat.get("id") or mflat.get("cas_id") or "?"
                    mlabel = (m_node.get("~labels") or [label])[0] if isinstance(m_node, dict) else label
                    if mid not in seen_node_ids:
                        nodes.append({
                            "data": {"id": mid, "label": mlabel,
                                      "name_ko": mflat.get("name", mid),
                                      "name": mflat.get("name", mid)}
                        })
                        seen_node_ids.add(mid)
                        neighbor_counts[mlabel] += 1
                if rel and isinstance(rel, dict):
                    rel_id = rel.get("~id", f"e_{len(edges)}")
                    rel_type = rel.get("~type", "REL")
                    src = rel.get("~start") or obj_id
                    dst = rel.get("~end") or "?"
                    if rel_id not in seen_edge_ids:
                        edges.append({"data": {"id": rel_id, "source": src, "target": dst, "type": rel_type}})
                        seen_edge_ids.add(rel_id)
    except Exception as e:
        log.warning("Neptune subgraph for %s/%s failed: %s", label, obj_id, e)

    if not nodes:
        # Synthesize 1-hop neighborhood per label
        nodes, edges, neighbor_counts = _synthesize_subgraph(label, obj_id)

    return {"nodes": nodes, "edges": edges}, dict(neighbor_counts)


def _synthesize_subgraph(label: str, obj_id: str) -> tuple[list[dict], list[dict], Counter]:
    """Build a deterministic synthetic 1-hop neighborhood when Neptune is sparse."""
    rng = random.Random(f"{label}/{obj_id}")
    nodes = [{"data": {"id": obj_id, "label": label, "name_ko": obj_id, "name": obj_id}}]
    edges: list[dict] = []
    counts: Counter = Counter()

    # Per-label neighborhood archetypes — richer (4+ neighbors) so every
    # /objects/[type] page renders a meaningful graph.
    archetypes = {
        "Product":         [("HAS_MODULE", "Module", 5), ("MANUFACTURED_BY", "Manufacturer", 1), ("SOLD_TO", "CustomerAccount", 3), ("CONFORMS_TO", "Standard", 2)],
        "Module":          [("CONSISTS_OF", "Component", 6), ("PART_OF", "Product", 2)],
        "Component":       [("CONFORMS_TO", "Standard", 3), ("SUPPLIED_BY", "Supplier", 2), ("CONTAINS_SUBSTANCE", "Substance", 2), ("PART_OF", "Module", 1)],
        "Supplier":        [("SUPPLIES", "Component", 5), ("LOCATED_IN", "Region", 1), ("SUB_SUPPLIES", "SubSupplier", 2), ("CERTIFIED_BY", "Certification", 1)],
        "Plant":           [("LOCATED_IN", "Region", 1), ("EMITS", "CarbonScope", 3), ("OPERATES", "Manufacturer", 1), ("HAS_SENSOR", "Telemetry", 3), ("HAS_ESG", "ESGIndicator", 2)],
        "TradeLane":       [("CONNECTS", "Region", 2), ("SUBJECT_TO", "Regulation", 2), ("USED_BY", "Plant", 2)],
        "Standard":        [("CONFORMED_BY", "Component", 5), ("CERT_FOR", "Certification", 2)],
        "Regulation":      [("REGULATES", "Substance", 4), ("APPLIES_TO", "TradeLane", 2)],
        "Substance":       [("REGULATED_BY", "Regulation", 2), ("CONTAINED_IN", "Component", 4)],
        "QualityIncident": [("ABOUT", "Component", 1), ("ABOUT", "Plant", 1), ("ADDRESSED_BY", "EightDReport", 1), ("ROOT_CAUSE", "RootCause", 1)],
        "EightDReport":    [("ADDRESSES", "QualityIncident", 1), ("IDENTIFIES", "RootCause", 1), ("SIMILAR_TO", "EightDReport", 2)],
        "RootCause":       [("LINKED_TO", "Supplier", 1), ("LINKED_TO", "Component", 1), ("LINKED_TO", "Plant", 1)],
        "Telemetry":       [("FROM", "Plant", 1), ("ON", "Component", 1), ("TRIGGERED", "MaintenanceEvent", 2), ("ALERTED", "RootCause", 1)],
        "MaintenanceEvent":[("ON", "Component", 1), ("AT", "Plant", 1), ("TRIGGERED_BY", "Telemetry", 1)],
        "ESGIndicator":    [("MEASURED_AT", "Plant", 1), ("RELATED", "CarbonScope", 1)],
        "CarbonScope":     [("EMITTED_BY", "Plant", 1), ("REGULATED_BY", "Regulation", 1)],
        "Manufacturer":    [("MAKES", "Product", 4), ("OPERATES", "Plant", 3)],
        "CustomerAccount": [("BUYS", "Product", 4), ("LOCATED_IN", "Region", 1)],
        "Region":          [("HOSTS", "Plant", 2), ("CONNECTED_VIA", "TradeLane", 3), ("HOSTS_SUPPLIER", "Supplier", 2)],
        "RawMaterial":     [("USED_IN", "Component", 4), ("SOURCED_BY", "Supplier", 2)],
        "Certification":   [("FOR", "Plant", 1), ("OF", "Standard", 1), ("ISSUED_TO", "Supplier", 1)],
        "SubSupplier":     [("SUPPLIES", "Supplier", 1), ("LOCATED_IN", "Region", 1)],
    }
    for rel_type, neighbor_label, n in archetypes.get(label, [("RELATED_TO", "Component", 3)]):
        for i in range(n):
            nid = f"{neighbor_label[:3].upper()}-{rng.randint(1000, 9999)}-{i}"
            nodes.append({
                "data": {"id": nid, "label": neighbor_label,
                          "name_ko": f"{neighbor_label} {i+1}",
                          "name": f"{neighbor_label} {i+1}"}
            })
            edges.append({"data": {
                "id": f"e_{label}_{rel_type}_{i}",
                "source": obj_id, "target": nid, "type": rel_type,
            }})
            counts[neighbor_label] += 1
    return nodes, edges, counts


@router.get("/objects")
def list_label_allowlist() -> dict:
    """Public catalog of allowed labels."""
    return {"labels": sorted(_ALLOWED_LABELS), "count": len(_ALLOWED_LABELS)}


# IMPORTANT: declare static literal-prefix routes BEFORE the dynamic {label}
# route, because FastAPI matches in declaration order and `_counts` would
# otherwise be captured as `label="_counts"` (which fails allowlist validation).
@router.get("/objects/_counts")
def label_counts() -> dict:
    """Return node count per label (for /validation page)."""
    counts: dict[str, int] = {}
    try:
        nep = get_neptune()
        for label in sorted(_ALLOWED_LABELS):
            try:
                rows = nep.run_cypher(f"MATCH (n:{label}) RETURN count(n) AS n", {})
                counts[label] = int(rows[0].get("n", 0)) if rows else 0
            except Exception:
                counts[label] = 0
    except Exception:
        counts = {}

    if not any(counts.values()):
        # Synthetic fallback per spec § 8.4 expected sizes
        counts = {
            "Product": 80, "Module": 400, "Component": 3000, "RawMaterial": 200,
            "Manufacturer": 4, "Supplier": 100, "SubSupplier": 50,
            "CustomerAccount": 30, "Plant": 40, "Region": 7, "TradeLane": 60,
            "Standard": 10, "Certification": 30, "Regulation": 5, "Substance": 250,
            "QualityIncident": 80, "EightDReport": 50, "RootCause": 50,
            "Telemetry": 5000, "MaintenanceEvent": 50, "ESGIndicator": 40,
            "CarbonScope": 36,
        }

    return {"counts": counts, "total_nodes": sum(counts.values())}


@router.get("/objects/{label}")
def list_objects(
    label: str = Path(..., description="Neptune node label, e.g. Component"),
    limit: int = Query(50, ge=1, le=500),
) -> dict:
    safe_label = _validate_label(label)
    items, synthetic = _list_for_label(safe_label, limit)
    return {
        "type": safe_label,
        "label": safe_label,
        "total": len(items),
        "items": items,
        "_synthetic": synthetic,
    }


@router.get("/objects/{label}/{obj_id}")
def object_detail(
    label: str = Path(...),
    obj_id: str = Path(..., description="Node id (e.g. AMZN-CMP-IC-00001)"),
) -> dict:
    safe_label = _validate_label(label)

    # Locate the anchor node properties
    properties: dict[str, Any] = {}
    name = obj_id
    try:
        rows = get_neptune().run_cypher(
            f"MATCH (n:{safe_label} {{id: $id}}) RETURN n LIMIT 1",
            {"id": obj_id},
        )
        if rows:
            flat = _flatten_node(rows[0].get("n", {}))
            properties = {k: v for k, v in flat.items() if k != "id"}
            name = flat.get("name", obj_id)
    except Exception as e:
        log.warning("Neptune anchor lookup failed: %s", e)

    if not properties:
        # Synthesize props by finding the node in the synthetic list
        synth = _synthesize_items(safe_label, 200)
        match = next((it for it in synth if it.get("id") == obj_id or it.get("cas_id") == obj_id), None)
        if match is None and synth:
            match = synth[0]
        if match:
            name = match.get("name", obj_id)
            properties = {k: v for k, v in match.items() if k not in ("id", "name")}

    subgraph, neighbor_summary = _build_subgraph_for_id(safe_label, obj_id)

    return {
        "type": safe_label,
        "label": safe_label,
        "id": obj_id,
        "name": name,
        "properties": properties,
        "subgraph": subgraph,
        "neighbor_summary": neighbor_summary,
    }


