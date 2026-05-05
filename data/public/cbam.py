"""EU CBAM (Carbon Border Adjustment Mechanism) — CN code subset + regulation.

Source: EU Regulation 2023/956. Transitional period 2023-10 to 2025-12,
definitive period from 2026-01 (importer pays CBAM certificates).
Subset chosen to cover hi-tech mfg upstream (steel/aluminium for chassis,
hydrogen/fertilizer not directly relevant but kept for completeness).
"""
from __future__ import annotations
from data.schemas import Regulation

_CN_CODES: list[dict] = [
    {"cn_code": "7208", "category": "Iron and steel — flat-rolled, hot-rolled"},
    {"cn_code": "7210", "category": "Iron and steel — coated/clad"},
    {"cn_code": "7301", "category": "Iron/steel sheet piling"},
    {"cn_code": "7601", "category": "Aluminium — unwrought"},
    {"cn_code": "7604", "category": "Aluminium bars, rods, profiles"},
    {"cn_code": "7606", "category": "Aluminium plates, sheets, strip"},
    {"cn_code": "2523", "category": "Cement clinkers"},
    {"cn_code": "3105", "category": "Mineral or chemical fertilisers"},
    {"cn_code": "2814", "category": "Ammonia"},
    {"cn_code": "2804 10", "category": "Hydrogen"},
    {"cn_code": "2716", "category": "Electricity"},
]


def load_cbam_cn_codes() -> list[dict]:
    return list(_CN_CODES)


def load_cbam_regulation() -> Regulation:
    return Regulation(
        id="CBAM",
        region="EU",
        title="Carbon Border Adjustment Mechanism (Regulation EU 2023/956)",
    )
