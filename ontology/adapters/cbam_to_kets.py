# ontology/adapters/cbam_to_kets.py
"""EU CBAM CN codes -> K-ETS (한국 배출권거래제) emission factor conversion.

K-ETS uses tonCO2e/ton for direct emissions. Used by `carbon_calc.cbam_calc()`
in Plan 2 to convert CBAM CN code attribution into K-ETS-comparable units.
"""
from __future__ import annotations

# CN code -> K-ETS direct emission factor (tCO2e per ton of product)
_CN_TO_KETS_FACTOR: dict[str, float] = {
    "7208": 2.1,    # Iron/steel hot-rolled (BF-BOF route)
    "7210": 2.3,    # Iron/steel coated
    "7301": 2.0,
    "7601": 11.5,   # Aluminium primary (electrolysis-heavy)
    "7604": 11.0,
    "7606": 10.8,
    "2523": 0.86,   # Cement clinker
    "3105": 1.5,    # Fertilizer
    "2814": 1.9,    # Ammonia
    "2804 10": 9.5, # Hydrogen (grey, SMR route)
    "2716": 0.45,   # Electricity (KR grid mix)
}


def cbam_cn_to_kets_factor(cn_code: str) -> float:
    """Return tCO2e/ton emission factor for a given CN code, defaulting to 1.0."""
    return _CN_TO_KETS_FACTOR.get(cn_code, 1.0)
