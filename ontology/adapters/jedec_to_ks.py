# ontology/adapters/jedec_to_ks.py
"""JEDEC -> KS C IEC mapping. Curated from KATS (Korean Agency for Technology and Standards) cross-walks."""
from __future__ import annotations


def jedec_to_ks_mapping() -> dict[str, str]:
    return {
        "JESD22": "KS C IEC 60749",  # Reliability test methods
        "JESD51": "KS C IEC 60068-2",  # Thermal test
        "JESD78": "KS C IEC 60749-29",  # Latch-up
    }
