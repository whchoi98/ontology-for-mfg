# data/public/ipc.py
from __future__ import annotations
from data.schemas import Standard

_RAW: list[tuple[str, str]] = [
    ("IPC-A-610",  "Acceptability of Electronic Assemblies"),
    ("IPC-J-STD-001", "Requirements for Soldered Electrical and Electronic Assemblies"),
    ("IPC-A-600",  "Acceptability of Printed Boards"),
    ("IPC-2221",   "Generic Standard on Printed Board Design"),
    ("IPC-7711/21","Rework, Modification, and Repair of Electronic Assemblies"),
    ("IPC-WHMA-A-620", "Requirements for Cable and Wire Harness Assemblies"),
]


def load_ipc_standards() -> list[Standard]:
    return [Standard(id=i, family="IPC", title=t) for i, t in _RAW]
