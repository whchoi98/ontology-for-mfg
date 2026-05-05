"""Suppliers (Tier-1: 100) + SubSuppliers (Tier-2: 50). Deterministic.

Region distribution biased toward CN/KR (typical hi-tech mfg supply chain),
with smaller presence in VN/MX/PL/US/IN.

Run: python -m data.synthetic.suppliers
Output: data/output/{suppliers,sub_suppliers}.ndjson
"""
from __future__ import annotations
import argparse
import random
from pathlib import Path
from data.schemas import Supplier, SubSupplier

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"

REGION_WEIGHTS = {"KR": 30, "CN": 25, "VN": 12, "MX": 8, "PL": 8, "US": 10, "IN": 7}
SUPPLIER_NAME_PREFIXES = ["Hanwha", "Daesun", "Sunwoo", "BlueOcean", "Kornic", "RedRock", "GreenLine", "PrimeAlloy", "Vertex", "Apex", "Synthon", "Arctic", "Pacific", "Beacon", "Quantum", "Helio", "Crystal", "Nexa", "Stellar", "Orion"]


def _pick_region(rng: random.Random) -> str:
    items = list(REGION_WEIGHTS.items())
    pool = [r for r, w in items for _ in range(w)]
    return rng.choice(pool)


def generate_suppliers(*, seed: int = 42) -> dict[str, list]:
    rng = random.Random(seed)

    suppliers: list[Supplier] = []
    for i in range(1, 101):
        prefix = rng.choice(SUPPLIER_NAME_PREFIXES)
        suppliers.append(Supplier(
            id=f"AMZN-SUP1-{i:03d}",
            name=f"{prefix} Industries {i}",
            tier=1,
            region=_pick_region(rng),
            rfm_recency=round(rng.uniform(0.4, 1.0), 3),
            rfm_frequency=round(rng.uniform(0.3, 1.0), 3),
            rfm_monetary=round(rng.uniform(0.3, 1.0), 3),
        ))

    sub_suppliers: list[SubSupplier] = []
    for i in range(1, 51):
        parent = rng.choice(suppliers)
        sub_suppliers.append(SubSupplier(
            id=f"AMZN-SUP2-{i:03d}",
            name=f"Tier2-{i}",
            parent_supplier_id=parent.id,
            region=_pick_region(rng),
        ))

    return {"suppliers": suppliers, "sub_suppliers": sub_suppliers}


def main() -> None:
    argparse.ArgumentParser().parse_args()
    out = generate_suppliers(seed=42)
    for key, items in out.items():
        path = OUTPUT_DIR / f"{key}.ndjson"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            for it in items:
                f.write(it.model_dump_json() + "\n")
        print(f"wrote {len(items):>3} → {path.name}")


if __name__ == "__main__":
    main()
