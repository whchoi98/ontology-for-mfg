"""EU RoHS Directive 2011/65/EU — 10 restricted substances (6 original + 4 phthalates).

Threshold: 0.1% by weight in homogeneous material (Cd: 0.01%).
"""
from __future__ import annotations
from data.schemas import Substance, Regulation

_ROHS_10: list[tuple[str, str]] = [
    ("7439-92-1", "Lead"),
    ("7439-97-6", "Mercury"),
    ("7440-43-9", "Cadmium"),
    ("18540-29-9", "Hexavalent chromium (Cr VI)"),
    ("32534-81-9", "Polybrominated biphenyls (PBB)"),
    ("32534-81-9", "Polybrominated diphenyl ethers (PBDE)"),
    ("117-81-7",  "Bis(2-ethylhexyl) phthalate (DEHP)"),
    ("85-68-7",   "Benzyl butyl phthalate (BBP)"),
    ("84-74-2",   "Dibutyl phthalate (DBP)"),
    ("84-69-5",   "Diisobutyl phthalate (DIBP)"),
]


def load_rohs_substances() -> list[Substance]:
    return [Substance(cas_id=cas, name=name, rohs_restricted=True) for cas, name in _ROHS_10]


def load_rohs_regulation() -> Regulation:
    return Regulation(id="RoHS", region="EU", title="RoHS Directive 2011/65/EU — Restriction of Hazardous Substances")
