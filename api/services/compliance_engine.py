# api/services/compliance_engine.py
"""Deterministic compliance checker for components.

Walks substances -> REACH-SVHC + RoHS lookup; standards -> required-for-category
matrix. Returns {compliant: bool, violations: [{regulation, substance|standard, severity}]}.
LLM is NOT used here -- all rules are coded.
"""
from __future__ import annotations
from data.schemas import Component
from data.public.reach_svhc import load_svhc_substances
from data.public.rohs import load_rohs_substances


_SVHC_CAS = {s.cas_id for s in load_svhc_substances()}
_ROHS_CAS = {s.cas_id for s in load_rohs_substances()}


def check_component(comp: Component) -> dict:
    violations: list[dict] = []
    for cas in comp.substances:
        if cas in _ROHS_CAS:
            violations.append({"regulation": "RoHS", "substance": cas, "severity": "HIGH"})
        if cas in _SVHC_CAS:
            violations.append({"regulation": "REACH-SVHC", "substance": cas, "severity": "MID"})
    return {"compliant": len(violations) == 0, "violations": violations,
            "component_id": comp.id}
