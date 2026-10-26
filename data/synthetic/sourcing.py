"""Component sourcing: approved-vendor offers (SUPPLIED_BY) + raw materials (MADE_OF).

Deterministic and independent of the BOM RNG: each concern uses its own
`random.Random(<constant>)`, so adding sourcing never reshuffles the BOM.

- Every component gets 1–3 Tier-1 supplier offers. Offer fields become the
  SUPPLIED_BY edge properties read by Scenario G (`api/routers/price.py`):
  `leadtime` (days), `otd` (0..1), `unit_price_usd`, `moq`.
- Every component gets 0–2 raw-material sources (boms.py docstring contract).
"""

from __future__ import annotations

import random

from data.schemas import Component, SupplyOffer


def assign_sourcing(
    components: list[Component],
    *,
    supplier_ids: list[str],
    raw_material_ids: list[str],
    seed: int = 42,
) -> list[Component]:
    offer_rng = random.Random(f"sourcing-offers-{seed}")
    raw_rng = random.Random(f"sourcing-raw-{seed}")
    out: list[Component] = []
    for c in components:
        supply: list[SupplyOffer] = []
        if supplier_ids:
            base_price = offer_rng.uniform(0.5, 15.0)
            for sid in offer_rng.sample(
                supplier_ids, k=min(len(supplier_ids), offer_rng.randint(1, 3))
            ):
                supply.append(
                    SupplyOffer(
                        supplier_id=sid,
                        leadtime=offer_rng.randint(5, 35),
                        otd=round(offer_rng.uniform(0.82, 0.99), 3),
                        unit_price_usd=round(base_price * offer_rng.uniform(0.85, 1.2), 3),
                        moq=offer_rng.choice([100, 500, 1000, 5000]),
                    )
                )
        raws: list[str] = []
        if raw_material_ids:
            raws = sorted(
                raw_rng.sample(
                    raw_material_ids, k=min(len(raw_material_ids), raw_rng.randint(0, 2))
                )
            )
        out.append(c.model_copy(update={"supply": supply, "raw_material_ids": raws}))
    return out
