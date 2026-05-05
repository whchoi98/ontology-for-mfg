# api/services/rfm_scorer.py
"""Supplier RFM (Recency / Frequency / Monetary) -- adapted for mfg as
Reliability (OTD) / Frequency (consistency = inverse defect rate) / Monetary
(responsiveness). Composite is geometric mean to penalize any-axis weakness.
"""
from __future__ import annotations
from math import pow


def _norm_otd(otd_pct: float) -> float:
    """OTD 95% = 0.5 baseline, 99.5% = 1.0, 80% = 0.0."""
    return max(0.0, min(1.0, (otd_pct - 0.80) / 0.195))


def _norm_defect(ppm: float) -> float:
    """0 ppm = 1.0, 1000 ppm = 0.0."""
    return max(0.0, min(1.0, 1.0 - ppm / 1000.0))


def _norm_response(hours: float) -> float:
    """1h = 1.0, 48h = 0.0."""
    return max(0.0, min(1.0, 1.0 - hours / 48.0))


def score_supplier(*, otd_pct: float, defect_ppm: float, response_hours: float) -> dict:
    r = _norm_otd(otd_pct)
    f = _norm_defect(defect_ppm)
    m = _norm_response(response_hours)
    composite = pow(max(r, 0.001) * max(f, 0.001) * max(m, 0.001), 1 / 3)
    return {"recency": r, "frequency": f, "monetary": m, "composite": round(composite, 3)}


def rank_suppliers(suppliers: list[dict]) -> list[dict]:
    out = []
    for s in suppliers:
        scores = score_supplier(
            otd_pct=s.get("otd_pct", 0.9),
            defect_ppm=s.get("defect_ppm", 200),
            response_hours=s.get("response_hours", 24),
        )
        out.append({**s, **scores})
    return sorted(out, key=lambda x: x["composite"], reverse=True)
