"""US trade regulations — IRA Section 30D + FEOC, USMCA Chapter 4 RVC rules.

IRA (Inflation Reduction Act) Section 30D: clean vehicle credit, requires
critical minerals + battery components NOT sourced from FEOC (Foreign Entity
of Concern) for full $7,500 credit.

USMCA (US-Mexico-Canada Agreement) Chapter 4: regional value content (RVC)
rules. Passenger vehicle requires 75% RVC by 2025-07.
"""
from __future__ import annotations
from data.schemas import Regulation

# FEOC list per Treasury Notice 2023-65 (covered nations)
FEOC_COUNTRIES: list[str] = ["CN", "RU", "KP", "IR"]  # China, Russia, North Korea, Iran

# USMCA Chapter 4 — Regional Value Content rules (% by 2025-07)
USMCA_AUTO_VALUE_CONTENT_RULES: dict[str, int] = {
    "passenger_vehicle": 75,
    "light_truck": 75,
    "heavy_truck": 70,
    "core_part": 75,        # engine, transmission, body, chassis, axle, suspension, steering, advanced battery
    "principal_part": 65,
    "complementary_part": 60,
}

# USMCA Steel/Aluminium Purchase Requirement (% by 2027)
USMCA_STEEL_ALUM_PURCHASE_PCT: int = 70


def load_ira_regulation() -> Regulation:
    return Regulation(
        id="IRA-30D",
        region="US",
        title="Inflation Reduction Act Section 30D — Clean Vehicle Credit + FEOC restriction",
    )


def load_usmca_regulation() -> Regulation:
    return Regulation(
        id="USMCA-Auto75",
        region="US",
        title="USMCA Chapter 4 — Regional Value Content rules (75% passenger vehicle by 2025-07)",
    )
