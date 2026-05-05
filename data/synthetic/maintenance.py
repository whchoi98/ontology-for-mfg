"""Maintenance events (800) — PM (preventive) / CM (corrective) / PdM (predictive)."""
from __future__ import annotations
import argparse
import json
import random
from datetime import date, timedelta
from pathlib import Path
from data.schemas import MaintenanceEvent

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "maintenance.ndjson"


def generate_maintenance(*, plant_ids: list[str], component_ids: list[str], seed: int = 42) -> list[MaintenanceEvent]:
    rng = random.Random(seed)
    targets = plant_ids + component_ids
    base = date(2025, 5, 1)
    out: list[MaintenanceEvent] = []
    for i in range(1, 801):
        kind = rng.choices(["PM", "CM", "PdM"], weights=[55, 30, 15])[0]
        out.append(MaintenanceEvent(
            id=f"AMZN-MAINT-{i:04d}",
            target_id=rng.choice(targets),
            kind=kind,  # type: ignore[arg-type]
            occurred_at=base + timedelta(days=rng.randint(0, 365)),
            duration_hours=round(rng.uniform(0.5, 8.0), 1),
        ))
    return out


def main() -> None:
    argparse.ArgumentParser().parse_args()
    pids = [json.loads(la)["id"] for la in (Path(__file__).resolve().parents[1] / "output" / "plants.ndjson").read_text().splitlines()]
    cids = [json.loads(la)["id"] for la in (Path(__file__).resolve().parents[1] / "output" / "components.ndjson").read_text().splitlines()]
    events = generate_maintenance(plant_ids=pids, component_ids=cids[:200], seed=42)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for e in events:
            f.write(e.model_dump_json() + "\n")
    print(f"wrote {len(events):>3} → {OUTPUT.name}")


if __name__ == "__main__":
    main()
