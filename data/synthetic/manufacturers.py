"""Self-operated manufacturer divisions (4). Magna JV is co-housed under INNOTEK
for the 4 사업부 view, but products in `data/synthetic/products.py` keep MAGNA
as the per-SKU division for finer-grained provenance.
"""
from __future__ import annotations
import argparse
from pathlib import Path
from data.schemas import Manufacturer

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "manufacturers.ndjson"

_RAW: list[tuple[str, str, str]] = [
    ("AMZN-MFG-HA",      "AMZN Tech Home Appliance",   "HA"),
    ("AMZN-MFG-HE",      "AMZN Tech Home Entertainment", "HE"),
    ("AMZN-MFG-VS",      "AMZN Tech Vehicle Solutions", "VS"),
    ("AMZN-MFG-INNOTEK", "AMZN Tech Innotek + Magna ePT JV", "INNOTEK"),
]


def generate_manufacturers() -> list[Manufacturer]:
    return [Manufacturer(id=i, name=n, division=d) for i, n, d in _RAW]  # type: ignore[arg-type]


def main() -> None:
    argparse.ArgumentParser().parse_args()
    items = generate_manufacturers()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for it in items:
            f.write(it.model_dump_json() + "\n")
    print(f"wrote {len(items)} → {OUTPUT.name}")


if __name__ == "__main__":
    main()
