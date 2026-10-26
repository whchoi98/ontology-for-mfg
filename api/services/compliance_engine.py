# api/services/compliance_engine.py
"""Deterministic substance-compliance checker for components.

Walks the component's declared substances (CAS ids) against the REACH-SVHC
candidate list and the RoHS restricted list. Standards / qualification
(AEC-Q, JEDEC, IPC) are NOT evaluated here — callers only echo which
standards a component declares. LLM is NOT used here -- all rules are coded.

Returns {status, compliant, violations[], component_id} where status is
  - "non_compliant"     — at least one declared substance is restricted
  - "compliant"         — substances declared, none restricted
  - "insufficient_data" — no substance declaration to evaluate; `compliant`
                          is None because "no data" must never read as a
                          clean bill of health
"""

from __future__ import annotations

from data.public.reach_svhc import load_svhc_substances
from data.public.rohs import load_rohs_substances
from data.schemas import Component

_SVHC_CAS = {s.cas_id for s in load_svhc_substances()}
_ROHS_CAS = {s.cas_id for s in load_rohs_substances()}


def check_component(comp: Component) -> dict:
    if not comp.substances:
        return {
            "status": "insufficient_data",
            "compliant": None,
            "violations": [],
            "component_id": comp.id,
        }
    violations: list[dict] = []
    for cas in comp.substances:
        if cas in _ROHS_CAS:
            violations.append({"regulation": "RoHS", "substance": cas, "severity": "HIGH"})
        if cas in _SVHC_CAS:
            violations.append({"regulation": "REACH-SVHC", "substance": cas, "severity": "MID"})
    compliant = len(violations) == 0
    return {
        "status": "compliant" if compliant else "non_compliant",
        "compliant": compliant,
        "violations": violations,
        "component_id": comp.id,
    }
