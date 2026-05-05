"""Plants (40) — self-operated 15 + supplier-operated 25, distributed across 7 regions."""
from __future__ import annotations
import argparse
import random
from pathlib import Path
from data.schemas import Plant

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "plants.ndjson"

REGION_DIST = {"KR": 8, "CN": 9, "VN": 5, "MX": 5, "PL": 4, "US": 5, "IN": 4}
DIVISIONS = ["HA", "HE", "VS", "INNOTEK", "MAGNA"]


def generate_plants(seed: int = 42) -> list[Plant]:
    rng = random.Random(seed)
    out: list[Plant] = []
    pid = 0
    for region, n in REGION_DIST.items():
        for i in range(n):
            pid += 1
            operator = "SELF" if pid <= 15 else "SUPPLIER"
            out.append(Plant(
                id=f"AMZN-PLANT-{pid:03d}",
                name=f"Plant-{region}-{i+1}",
                region=region,
                operator=operator,  # type: ignore[arg-type]
                division=rng.choice(DIVISIONS) if operator == "SELF" else None,
            ))
    return out


def main() -> None:
    argparse.ArgumentParser().parse_args()
    plants = generate_plants()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for p in plants:
            f.write(p.model_dump_json() + "\n")
    print(f"wrote {len(plants)} → {OUTPUT.name}")


if __name__ == "__main__":
    main()
