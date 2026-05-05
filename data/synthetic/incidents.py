"""Quality incidents (300) + 8D reports (200) + RootCause (150).

The wow-moment scenario J targets `INC-2026-0412 BGA solder ball crack`,
seeded as a fixed entry for the demo (spec § 8.6 Wow-Moment Tuning).
"""
from __future__ import annotations
import argparse
import json
import random
from datetime import date, timedelta
from pathlib import Path
from data.schemas import QualityIncident, EightDReport, RootCause

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"
SEVERITIES = ["LOW", "MID", "HIGH", "CRITICAL"]
INCIDENT_TITLES = [
    "Solder ball crack", "Capacitor leakage", "Connector intermittent",
    "PCB delamination", "Display dead pixel", "Battery thermal runaway",
    "Motor bearing wear", "Sensor calibration drift", "Optical misalignment",
    "Memory bit flip", "Antenna gain drop", "Cable shielding break",
]


def generate_incidents(*, component_ids: list[str], supplier_ids: list[str], plant_ids: list[str], seed: int = 42) -> dict[str, list]:
    rng = random.Random(seed)
    base_date = date(2025, 5, 1)

    incidents: list[QualityIncident] = []

    # Demo wow fixture — direct constructor, no model_dump round-trip
    incidents.append(QualityIncident(
        id="INC-2026-0412",
        title="BGA solder ball crack on Innotek FC-BGA Gen5 (lot 2026-Q1-W04)",
        component_id=component_ids[0] if component_ids else "AMZN-CMP-IC-00001",
        plant_id=plant_ids[0] if plant_ids else "AMZN-PLANT-001",
        severity="CRITICAL",
        occurred_at=date(2026, 4, 12),
    ))

    # 299 random incidents — direct constructor, no model_dump round-trip
    for i in range(2, 301):
        cid = rng.choice(component_ids) if component_ids else None
        pid = rng.choice(plant_ids) if plant_ids else None
        incidents.append(QualityIncident(
            id=f"INC-2026-{i:04d}",
            title=rng.choice(INCIDENT_TITLES),
            component_id=cid,
            plant_id=pid,
            severity=rng.choices(SEVERITIES, weights=[40, 35, 20, 5])[0],
            occurred_at=base_date + timedelta(days=rng.randint(0, 365)),
        ))

    # 200 EightDReports — link to first 200 incidents
    eight_d: list[EightDReport] = []
    for i, inc in enumerate(incidents[:200], start=1):
        eight_d.append(EightDReport(
            id=f"8D-2026-{i:04d}",
            incident_id=inc.id,
            d1_team=f"Quality team {rng.randint(1, 8)}",
            d2_problem=inc.title,
            d3_containment="Quarantine affected lots; halt shipments to OEM A",
            d4_root_cause="See linked RootCause node",
            d5_corrective="Update supplier inspection AQL from 0.65 to 0.40",
            d6_implemented=f"Implemented at {inc.plant_id or 'all plants'} on next changeover",
            d7_prevention="Add reflow temperature SPC chart with auto-alert",
            d8_closure="Closure approved by Quality Director; 60-day verification",
        ))

    # 150 RootCauses — link to first 150 incidents
    root_causes: list[RootCause] = []
    for i, inc in enumerate(incidents[:150], start=1):
        root_causes.append(RootCause(
            id=f"RC-2026-{i:04d}",
            description=rng.choice([
                "Reflow temperature profile drift (peak +8°C above spec)",
                "Substrate moisture absorption (storage humidity 65% vs spec 50%)",
                "Solder paste expiration (used 35 days post-print, spec 28)",
                "Component placement offset (machine A12 calibration drift 0.08mm)",
                "Material change at Tier-2 (different copper thickness)",
            ]),
            linked_supplier_id=rng.choice(supplier_ids) if supplier_ids else None,
            linked_component_id=inc.component_id,
            linked_plant_id=inc.plant_id,
        ))

    return {"incidents": incidents, "eight_d_reports": eight_d, "root_causes": root_causes}


def main() -> None:
    argparse.ArgumentParser().parse_args()
    cids = [json.loads(la)["id"] for la in (OUTPUT_DIR / "components.ndjson").read_text().splitlines()]
    sids = [json.loads(la)["id"] for la in (OUTPUT_DIR / "suppliers.ndjson").read_text().splitlines()]
    pids = [json.loads(la)["id"] for la in (OUTPUT_DIR / "plants.ndjson").read_text().splitlines()]
    out = generate_incidents(component_ids=cids, supplier_ids=sids, plant_ids=pids, seed=42)
    for key, items in out.items():
        path = OUTPUT_DIR / f"{key}.ndjson"
        with path.open("w", encoding="utf-8") as f:
            for it in items:
                f.write(it.model_dump_json() + "\n")
        print(f"wrote {len(items):>3} → {path.name}")


if __name__ == "__main__":
    main()
