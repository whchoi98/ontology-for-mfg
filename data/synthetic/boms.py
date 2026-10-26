"""BOM (Bill of Materials) generator: Modules / Components / RawMaterials.

Deterministic. Each Product has 5 Modules avg, each Module has 8 Components avg,
each Component has 0–2 RawMaterial sources. Component IDs are scoped by category
(IC/PCB/Connector/Mechanical/Display/Battery/etc) to make Substitute (F) and
SpecMatch (D) scenarios more realistic.

`main()` additionally runs `enrich_bom()`: standards/substances
(`enrich_components.py`) + supplier offers / raw materials (`sourcing.py`),
so components.ndjson carries every FK the graph loader turns into edges.

Run: python -m data.synthetic.boms [--seed N]
Output: data/output/{modules,components,raw_materials}.ndjson
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from data.schemas import Component, Module, RawMaterial
from data.synthetic.enrich_components import enrich_components_with_standards
from data.synthetic.sourcing import assign_sourcing

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"

DEMO_HERO_COMPONENT_ID = "AMZN-CMP-IC-00001"

COMPONENT_CATEGORIES = [
    "IC",
    "PCB",
    "Connector",
    "Mechanical",
    "Display",
    "Battery",
    "Sensor",
    "Power",
    "Motor",
    "Cable",
    "Optical",
    "Antenna",
    "Memory",
    "Magnetic",
]

RAW_MATERIAL_NAMES = [
    "Silicon wafer 200mm",
    "Silicon wafer 300mm",
    "Copper foil 18μm",
    "Aluminium ingot",
    "Polyimide film",
    "FR-4 substrate",
    "Epoxy mold compound",
    "Tin-silver solder",
    "Indium tin oxide",
    "Liquid crystal mixture",
    "Lithium iron phosphate",
    "NMC 811 cathode",
    "Graphite anode",
    "Electrolyte LiPF6",
    "Magnet NdFeB",
    # ~30 more — repeat pattern for total ~200
]


def generate_boms(*, product_ids: list[str], seed: int = 42) -> dict[str, list]:
    rng = random.Random(seed)

    # Modules: 5/product avg with variance — total ~400 for 80 products
    modules: list[Module] = []
    module_counter = 0
    for pid in product_ids[:80]:  # cap to 80 distinct products
        n_modules = rng.randint(4, 6)
        for _ in range(n_modules):
            module_counter += 1
            modules.append(
                Module(
                    id=f"AMZN-MOD-{module_counter:04d}",
                    name=f"Module-{module_counter}",
                    category=rng.choice(
                        [
                            "Display",
                            "PowerSupply",
                            "Mainboard",
                            "Compressor",
                            "Inverter",
                            "Sensor",
                            "Battery",
                        ]
                    ),
                    parent_product_ids=[pid],
                )
            )

    # Components: ~7.5/module avg — total ~3000 for 400 modules
    components: list[Component] = []
    comp_counter = 0
    for mod in modules:
        n_comps = rng.randint(6, 9)
        for _ in range(n_comps):
            comp_counter += 1
            cat = rng.choice(COMPONENT_CATEGORIES)
            components.append(
                Component(
                    id=f"AMZN-CMP-{cat[:3].upper()}-{comp_counter:05d}",
                    name=f"{cat}-{comp_counter}",
                    category=cat,
                    standards=[],  # filled by enrich_bom()
                    substances=[],  # filled by enrich_bom()
                    module_ids=[mod.id],
                )
            )

    # The demo's hero part. Every sample (/chat, /compliance, /substitute, /price,
    # Manny) starts from AMZN-CMP-IC-00001, but the global counter numbers the first
    # IC 00012 — so the hero never existed in Neptune. Rename it here, before any
    # other generator references component ids.
    first_ic = next(i for i, c in enumerate(components) if c.category == "IC")
    components[first_ic] = components[first_ic].model_copy(update={"id": DEMO_HERO_COMPONENT_ID})

    # RawMaterials: ~200, named pool repeated/varied
    raw_pool = RAW_MATERIAL_NAMES + [
        f"Generic raw {i}" for i in range(200 - len(RAW_MATERIAL_NAMES))
    ]
    raw_materials = [
        RawMaterial(id=f"AMZN-RAW-{i:04d}", name=name)
        for i, name in enumerate(raw_pool[:200], start=1)
    ]

    return {"modules": modules, "components": components, "raw_materials": raw_materials}


def enrich_bom(bom: dict[str, list], *, supplier_ids: list[str], seed: int = 42) -> dict[str, list]:
    """Fill component standards/substances + sourcing (offers, raw materials)."""
    comps = enrich_components_with_standards(bom["components"], seed=seed)
    comps = assign_sourcing(
        comps,
        supplier_ids=supplier_ids,
        raw_material_ids=[r.id for r in bom["raw_materials"]],
        seed=seed,
    )
    return {**bom, "components": comps}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()
    products_path = OUTPUT_DIR / "products.ndjson"
    if not products_path.exists():
        raise SystemExit("Run `python -m data.synthetic.products` first.")
    pids = [
        json.loads(line)["id"] for line in products_path.read_text(encoding="utf-8").splitlines()
    ]
    # Supplier ids are deterministic (suppliers.py, seed 42) — generated here in
    # memory because suppliers.ndjson is written after this step.
    from data.synthetic.suppliers import generate_suppliers

    supplier_ids = [s.id for s in generate_suppliers(seed=42)["suppliers"]]
    bom = enrich_bom(
        generate_boms(product_ids=pids, seed=args.seed), supplier_ids=supplier_ids, seed=args.seed
    )
    for key, items in bom.items():
        out = OUTPUT_DIR / f"{key}.ndjson"
        with out.open("w", encoding="utf-8") as f:
            for it in items:
                f.write(it.model_dump_json() + "\n")
        print(f"wrote {len(items):>5} → {out.name}")


if __name__ == "__main__":
    main()
