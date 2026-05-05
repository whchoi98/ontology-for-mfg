# api/services/carbon_calc.py
"""Scope 1/2/3 carbon and EU CBAM fee calculator.

Scope 1: direct_kg_co2 -> tons
Scope 2: electricity_kwh x kr_grid_factor (0.46 kg CO2/kWh, KR 2024 mix)
Scope 3: upstream_tons (Tier-1 supplier emissions, externally provided)
CBAM: tons x cn_code_factor x eu_carbon_price_eur
"""
from __future__ import annotations
from ontology.adapters.cbam_to_kets import cbam_cn_to_kets_factor

KR_GRID_FACTOR_KG_CO2_PER_KWH = 0.46  # KR national grid mix 2024


def scope_1_2_3(*, plant_id: str, direct_kg_co2: float, electricity_kwh: float,
                 upstream_tons: float) -> dict:
    s1_t = direct_kg_co2 / 1000.0
    s2_t = electricity_kwh * KR_GRID_FACTOR_KG_CO2_PER_KWH / 1000.0
    s3_t = upstream_tons
    return {
        "plant_id": plant_id,
        "scope_1_t": round(s1_t, 2),
        "scope_2_t": round(s2_t, 2),
        "scope_3_t": round(s3_t, 2),
        "total_t": round(s1_t + s2_t + s3_t, 2),
    }


def cbam_calc(*, cn_code: str, tons: float, eu_carbon_price_eur: float = 80.0) -> float:
    factor = cbam_cn_to_kets_factor(cn_code)
    return round(tons * factor * eu_carbon_price_eur, 2)
