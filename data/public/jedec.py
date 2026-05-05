"""JEDEC reliability/packaging standards subset for hi-tech MFG demo.

Source: https://www.jedec.org/ (public titles, no member-only docs).
"""
from __future__ import annotations
from data.schemas import Standard

_RAW: list[tuple[str, str, str | None]] = [
    ("JESD22",  "Reliability Test Methods for Packaged Devices", "KS C IEC 60749"),
    ("JESD46",  "Solid State Memories: Standards & Definitions", None),
    ("JESD47",  "Stress-Test-Driven Qualification of ICs", None),
    ("JESD51",  "Thermal Test Method for Surface-Mount Packages", None),
    ("JESD78",  "IC Latch-Up Test", None),
    ("JESD89",  "Soft Error Rate Measurement", None),
    ("MO-220",  "Ball Grid Array (BGA) Outline", None),
    ("MO-247",  "Quad Flat No-Lead Outline", None),
    ("JEP122",  "Failure Mechanisms and Models for ICs", None),
    ("JEP155",  "ESD Sensitivity Classification", None),
]


def load_jedec_standards() -> list[Standard]:
    return [
        Standard(id=jid, family="JEDEC", title=title, ks_mapping=ks)
        for jid, title, ks in _RAW
    ]
