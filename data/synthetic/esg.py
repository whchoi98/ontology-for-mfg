"""ESGIndicator (100) + CarbonScope (120 = 40 plants × 3 scopes)."""
from __future__ import annotations
import argparse
import json
import random
from pathlib import Path
from data.schemas import ESGIndicator, CarbonScope

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"
INDICATOR_METRICS = ["water_use_m3", "waste_kg", "lost_time_injury_rate", "diversity_pct", "training_hours"]
PERIODS = ["2025-Q3", "2025-Q4", "2026-Q1"]


def generate_esg(*, plant_ids: list[str], seed: int = 42) -> dict[str, list]:
    rng = random.Random(seed)

    indicators: list[ESGIndicator] = []
    for i in range(1, 101):
        indicators.append(ESGIndicator(
            id=f"AMZN-ESG-{i:03d}",
            plant_id=rng.choice(plant_ids),
            metric=rng.choice(INDICATOR_METRICS),
            period=rng.choice(PERIODS),
            value=round(rng.uniform(10, 5000), 1),
        ))

    carbon: list[CarbonScope] = []
    for pid in plant_ids:
        for scope in (1, 2, 3):
            carbon.append(CarbonScope(
                plant_id=pid,
                scope=scope,  # type: ignore[arg-type]
                period="2026-Q1",
                co2e_tons=round(rng.uniform(50, 5000), 1),
            ))

    return {"indicators": indicators, "carbon_scopes": carbon}


def main() -> None:
    argparse.ArgumentParser().parse_args()
    pids = [json.loads(la)["id"] for la in (OUTPUT_DIR / "plants.ndjson").read_text().splitlines()]
    out = generate_esg(plant_ids=pids, seed=42)
    for key, items in out.items():
        path = OUTPUT_DIR / f"esg_{key}.ndjson"
        with path.open("w", encoding="utf-8") as f:
            for it in items:
                f.write(it.model_dump_json() + "\n")
        print(f"wrote {len(items):>3} → {path.name}")


if __name__ == "__main__":
    main()
