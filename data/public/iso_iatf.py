# data/public/iso_iatf.py
from __future__ import annotations
from data.schemas import Standard

_RAW: list[tuple[str, str, str, str | None]] = [
    ("IATF-16949", "IATF", "Quality Management System for Automotive", None),
    ("ISO-26262", "ISO", "Road vehicles — Functional safety (ASIL A–D)", None),
    ("ISO-9001",  "ISO", "Quality Management Systems — Requirements", "KS Q ISO 9001"),
    ("ISO-14001", "ISO", "Environmental Management Systems — Requirements", "KS I ISO 14001"),
    ("ISO-45001", "ISO", "Occupational Health and Safety Management Systems", None),
    ("ISO-50001", "ISO", "Energy Management Systems", None),
]


def load_iso_iatf_standards() -> list[Standard]:
    return [Standard(id=i, family=f, title=t, ks_mapping=ks) for i, f, t, ks in _RAW]


# ISO 26262 ASIL grades (used as Component property, not separate Standard rows)
ASIL_GRADES = ["QM", "ASIL-A", "ASIL-B", "ASIL-C", "ASIL-D"]
