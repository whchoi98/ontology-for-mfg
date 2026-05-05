"""Product (SKU) generator. 80 total = 5 lines × ~16 SKUs each.

Deterministic (no LLM) — product names follow AMZN Tech naming convention from
spec § D.2: SmartFridge X9, VisionOLED 88, AutoCockpit C7, FC-BGA Gen5, eDrive 350iPT.

Run: python -m data.synthetic.products [--seed N]
Output: data/output/products.ndjson
"""
from __future__ import annotations
import argparse
import random
from pathlib import Path
from data.schemas import Product

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "products.ndjson"

# (line, division, count, model_seeds)
# model_seeds = list of suffixes to combine with line; total length determines count
LINES: list[tuple[str, str, list[str]]] = [
    ("SmartFridge", "HA", ["X9", "X9 Pro", "X8", "X7", "X7 Slim", "X6", "X5", "Mini X3", "Bottom-Freezer X9", "French-Door X9", "Side-by-Side X8", "Compact X4", "Built-In X9", "Wine Cellar X6", "Showcase X8", "Inverter X7"]),
    ("VisionOLED",  "HE", ["88", "77", "65", "55", "48 Game", "97 Wallpaper", "83 Cinema", "75 Pro", "65 Pro", "55 Pro", "42 Smart", "32 Smart", "75 Frame", "65 Frame", "48 Frame", "32 Compact"]),
    ("AutoCockpit", "VS", ["C7", "C7 Pro", "C5", "C5 Lite", "C3", "C3 Eco", "Cluster A3", "Cluster A5", "InfoDrive 5", "InfoDrive 7", "ADAS Bundle 2", "ADAS Bundle 3", "AR-HUD H1", "AR-HUD H2", "Telematics T1", "Telematics T2"]),
    ("FC-BGA",      "INNOTEK", ["Gen5", "Gen5 Pro", "Gen5 HPC", "Gen5 Auto", "Gen5 Comm", "Gen4", "Gen4 Auto", "Gen4 Mobile", "CIS-50MP M9", "CIS-108MP M11", "CIS-12MP M5", "MotorDrive M3", "MotorDrive M5", "PMIC P1", "PMIC P2", "RFFE R1"]),
    ("eDrive",      "MAGNA", ["350iPT", "350iPT Pro", "200iPT", "200iPT Compact", "150eMotor", "150eMotor Lite", "Inverter Pro 800V", "Inverter Std 400V", "Reducer R1", "Reducer R2", "Inverter Pro 1200V", "BMS B1", "BMS B2", "Charger C1 11kW", "Charger C2 22kW", "ePT Bundle X3"]),
]


def generate_products(seed: int = 42) -> list[Product]:
    rng = random.Random(seed)
    out: list[Product] = []
    for line, division, model_seeds in LINES:
        for i, model in enumerate(model_seeds, start=1):
            sku_code = f"AMZN-{division}-{line.replace(' ', '')}-{i:03d}"
            # name: line + space + model — but FC-BGA already has line in suffix
            name = f"{line} {model}" if not model.startswith(line) else model
            out.append(Product(
                id=sku_code,
                name=f"AMZN {name}",
                line=line,
                division=division,  # type: ignore[arg-type]
                brand="AMZN Tech",
                sku_code=sku_code,
            ))
    rng.shuffle(out)
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()
    products = generate_products(seed=args.seed)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for prod in products:
            f.write(prod.model_dump_json() + "\n")
    print(f"wrote {len(products)} products → {OUTPUT}")


if __name__ == "__main__":
    main()
