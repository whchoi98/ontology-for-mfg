"""Generate the full synthetic dataset in one pass (in memory, no AWS).

Equivalent to `make data` (each generator's `main()` in dependency order) but
callable with any output directory — used by the loader unit tests and the
graph-contract test so they never depend on a stale `data/output/`.

Run: python -m data.synthetic.pipeline [--out DIR]
"""

from __future__ import annotations

import argparse
from collections.abc import Iterable, Sequence
from pathlib import Path

from pydantic import BaseModel

from data.synthetic.boms import enrich_bom, generate_boms
from data.synthetic.customers import generate_customers
from data.synthetic.esg import generate_esg
from data.synthetic.incidents import generate_incidents
from data.synthetic.lanes import generate_lanes
from data.synthetic.maintenance import generate_maintenance
from data.synthetic.manufacturers import generate_manufacturers
from data.synthetic.plants import generate_certifications, generate_plants
from data.synthetic.products import generate_products
from data.synthetic.suppliers import generate_suppliers
from data.synthetic.telemetry import generate_telemetry

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"


def generate_dataset_records(seed: int = 42) -> dict[str, Sequence[BaseModel]]:
    """Return {ndjson file stem: [records]} exactly as the per-module mains write them."""
    products = generate_products(seed=seed)
    sup = generate_suppliers(seed=42)
    supplier_ids = [s.id for s in sup["suppliers"]]
    bom = enrich_bom(
        generate_boms(product_ids=[p.id for p in products], seed=seed),
        supplier_ids=supplier_ids,
        seed=seed,
    )
    plants = generate_plants()
    plant_ids = [p.id for p in plants]
    component_ids = [c.id for c in bom["components"]]
    inc = generate_incidents(
        component_ids=component_ids, supplier_ids=supplier_ids, plant_ids=plant_ids, seed=42
    )
    esg = generate_esg(plant_ids=plant_ids, seed=42)
    return {
        "products": products,
        "manufacturers": generate_manufacturers(),
        "modules": bom["modules"],
        "components": bom["components"],
        "raw_materials": bom["raw_materials"],
        "suppliers": sup["suppliers"],
        "sub_suppliers": sup["sub_suppliers"],
        "customers": generate_customers(),
        "plants": plants,
        "certifications": generate_certifications(plants),
        "lanes": generate_lanes(),
        "incidents": inc["incidents"],
        "eight_d_reports": inc["eight_d_reports"],
        "root_causes": inc["root_causes"],
        "telemetry": generate_telemetry(
            plant_ids=plant_ids, component_ids=component_ids[:200], seed=42
        ),
        "maintenance": generate_maintenance(
            plant_ids=plant_ids, component_ids=component_ids[:200], seed=42
        ),
        "esg_indicators": esg["indicators"],
        "esg_carbon_scopes": esg["carbon_scopes"],
    }


def _write(path: Path, items: Iterable[BaseModel]) -> int:
    n = 0
    with path.open("w", encoding="utf-8") as f:
        for it in items:
            f.write(it.model_dump_json() + "\n")
            n += 1
    return n


def generate_dataset(output_dir: Path = OUTPUT_DIR, seed: int = 42) -> dict[str, int]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    return {
        stem: _write(output_dir / f"{stem}.ndjson", items)
        for stem, items in generate_dataset_records(seed=seed).items()
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, default=OUTPUT_DIR)
    args = p.parse_args()
    for stem, n in generate_dataset(args.out).items():
        print(f"wrote {n:>5} → {stem}.ndjson")


if __name__ == "__main__":
    main()
