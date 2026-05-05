# data/public/aec_q.py
from __future__ import annotations
from data.schemas import Standard

_RAW: list[tuple[str, str]] = [
    ("AEC-Q100", "Failure Mechanism Based Stress Test Qualification for ICs"),
    ("AEC-Q101", "Failure Mechanism Based Stress Test Qualification for Discrete Semiconductors"),
    ("AEC-Q102", "Failure Mechanism Based Stress Test Qualification for Discrete Optoelectronic Semiconductors"),
    ("AEC-Q104", "Failure Mechanism Based Stress Test Qualification for Multichip Modules"),
    ("AEC-Q200", "Stress Test Qualification for Passive Components"),
]


def load_aec_q_standards() -> list[Standard]:
    return [Standard(id=i, family="AEC-Q", title=t) for i, t in _RAW]
