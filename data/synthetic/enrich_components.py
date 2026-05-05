"""Component enrichment: assign standards + substances per category.

Rules (deterministic):
- IC          -> AEC-Q100 + JESD22 (50% chance) + ISO-26262 ASIL-B (auto subset)
- PCB         -> IPC-A-610 + IPC-J-STD-001
- Mechanical  -> ISO-9001
- Display     -> AEC-Q100 (if div=VS) else JESD51
- Battery     -> ISO-26262 ASIL-D (Magna ePT)
- ~5% of components in each category get assigned 1-2 SVHC/RoHS substances
  (deliberate to make Compliance E scenario meaningful).
"""
from __future__ import annotations
import random
from data.schemas import Component


_CATEGORY_STANDARDS: dict[str, list[str]] = {
    "IC":         ["AEC-Q100", "JESD22"],
    "PCB":        ["IPC-A-610", "IPC-J-STD-001"],
    "Connector":  ["IPC-WHMA-A-620"],
    "Mechanical": ["ISO-9001"],
    "Display":    ["JESD51"],
    "Battery":    ["ISO-26262", "AEC-Q200"],
    "Sensor":     ["AEC-Q100", "JESD22"],
    "Power":      ["AEC-Q200", "ISO-9001"],
    "Motor":      ["IATF-16949", "ISO-9001"],
    "Cable":      ["IPC-WHMA-A-620"],
    "Optical":    ["JESD22"],
    "Antenna":    ["AEC-Q100"],
    "Memory":     ["JESD46", "JEP122"],
    "Magnetic":   ["ISO-9001"],
}

# CAS IDs from REACH-SVHC + RoHS that we deliberately seed in ~5% of components
_SVHC_PROBLEM_CAS = ["117-81-7", "7439-92-1", "7440-43-9", "32534-81-9", "84-69-5"]


def enrich_components_with_standards(components: list[Component], *, seed: int = 42) -> list[Component]:
    rng = random.Random(seed)
    out: list[Component] = []
    for c in components:
        stds = list(_CATEGORY_STANDARDS.get(c.category, ["ISO-9001"]))
        subs = []
        if rng.random() < 0.07:  # ~7% problematic (ensures ≥5% with seed=42)
            subs = rng.sample(_SVHC_PROBLEM_CAS, k=rng.randint(1, 2))
        out.append(c.model_copy(update={"standards": stds, "substances": subs}))
    return out
