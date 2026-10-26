"""Telemetry sensor metadata (5,000). Time-series payload is generated separately
during loader (Task 26) into OpenSearch — this module emits only sensor metadata."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from data.schemas import Telemetry

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "telemetry.ndjson"
METRICS = [
    ("vibration_rms_g", "g"),
    ("temp_c", "°C"),
    ("current_a", "A"),
    ("voltage_v", "V"),
    ("pressure_kpa", "kPa"),
    ("rpm", "rpm"),
    ("flow_lpm", "L/min"),
    ("humidity_pct", "%"),
]


def generate_telemetry(
    *, plant_ids: list[str], component_ids: list[str] | None = None, seed: int = 42
) -> list[Telemetry]:
    rng = random.Random(seed)
    # ~10% of sensors are mounted on a specific component (MONITORS); own RNG
    # so plant / metric draws stay identical to the pre-MONITORS output.
    comp_rng = random.Random(f"telemetry-component-{seed}")
    out: list[Telemetry] = []
    for i in range(1, 5001):
        metric, unit = rng.choice(METRICS)
        cid = None
        if component_ids and comp_rng.random() < 0.1:
            cid = comp_rng.choice(component_ids)
        out.append(
            Telemetry(
                sensor_id=f"AMZN-SENSOR-{i:05d}",
                plant_id=rng.choice(plant_ids),
                component_id=cid,
                metric=metric,
                unit=unit,
            )
        )
    return out


def main() -> None:
    argparse.ArgumentParser().parse_args()
    out_dir = OUTPUT.parent
    pids = [json.loads(la)["id"] for la in (out_dir / "plants.ndjson").read_text().splitlines()]
    cids = [json.loads(la)["id"] for la in (out_dir / "components.ndjson").read_text().splitlines()]
    sensors = generate_telemetry(plant_ids=pids, component_ids=cids[:200], seed=42)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for s in sensors:
            f.write(s.model_dump_json() + "\n")
    print(f"wrote {len(sensors):>5} → {OUTPUT.name}")


if __name__ == "__main__":
    main()
