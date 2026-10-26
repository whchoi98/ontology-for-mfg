"""Plants (40) — self-operated 15 + supplier-operated 25, distributed across 7 regions.

Also emits plant-level management-system Certifications (ISO 9001 for every
plant, IATF 16949 for automotive divisions / supplier plants, ISO 14001 /
ISO 50001 for a deterministic subset) → `certifications.ndjson`.
"""

from __future__ import annotations

import argparse
import random
from datetime import date, timedelta
from pathlib import Path

from data.schemas import Certification, Plant
from data.synthetic.manufacturers import manufacturer_id_for_division

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "plants.ndjson"
CERT_OUTPUT = OUTPUT.parent / "certifications.ndjson"

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
            out.append(
                Plant(
                    id=f"AMZN-PLANT-{pid:03d}",
                    name=f"Plant-{region}-{i+1}",
                    region=region,
                    operator=operator,  # type: ignore[arg-type]
                    division=rng.choice(DIVISIONS) if operator == "SELF" else None,
                )
            )
    # OPERATES: self-operated plants belong to their division's manufacturer
    return [
        p.model_copy(update={"manufacturer_id": manufacturer_id_for_division(p.division)})
        for p in out
    ]


def generate_certifications(plants: list[Plant], seed: int = 42) -> list[Certification]:
    """Plant management-system certificates (CERTIFIED_BY / FOR_STANDARD)."""
    rng = random.Random(f"certifications-{seed}")
    base = date(2026, 1, 1)
    out: list[Certification] = []
    for p in plants:
        stds = ["ISO-9001"]
        if p.operator == "SUPPLIER" or p.division in ("VS", "MAGNA", "INNOTEK"):
            stds.append("IATF-16949")
        if rng.random() < 0.6:
            stds.append("ISO-14001")
        if rng.random() < 0.3:
            stds.append("ISO-50001")
        for std in stds:
            out.append(
                Certification(
                    id=f"CERT-{p.id}-{std}",
                    target_id=p.id,
                    standard_id=std,
                    expires=base + timedelta(days=rng.randint(90, 3 * 365)),
                )
            )
    return out


def main() -> None:
    argparse.ArgumentParser().parse_args()
    plants = generate_plants()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for p in plants:
            f.write(p.model_dump_json() + "\n")
    print(f"wrote {len(plants)} → {OUTPUT.name}")
    certs = generate_certifications(plants)
    with CERT_OUTPUT.open("w", encoding="utf-8") as f:
        for c in certs:
            f.write(c.model_dump_json() + "\n")
    print(f"wrote {len(certs)} → {CERT_OUTPUT.name}")


if __name__ == "__main__":
    main()
