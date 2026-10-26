"""Common, non-restricted constituent substances of electronics BOM parts.

Real CAS Registry Numbers. None of these is on the REACH-SVHC subset
(`reach_svhc.py`) or the RoHS list (`rohs.py`), so a component declaring only
these is *compliant by declaration* — as opposed to an empty declaration,
which the compliance check treats as insufficient data. Kept in sync with the
benign pool used by `api/routers/compliance.py`'s synthetic fallback.
"""

from __future__ import annotations

from data.schemas import Substance

_RAW: list[tuple[str, str]] = [
    ("7440-31-5", "Tin"),
    ("7429-90-5", "Aluminium"),
    ("7440-22-4", "Silver"),
    ("7440-21-3", "Silicon"),
]

BENIGN_CAS: list[str] = [cas for cas, _ in _RAW]


def load_common_materials() -> list[Substance]:
    return [Substance(cas_id=cas, name=name) for cas, name in _RAW]
