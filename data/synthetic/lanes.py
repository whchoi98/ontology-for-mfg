"""Trade lanes (120) — multimodal, with IRA/USMCA/CBAM regulatory tags.

Coverage rules:
- Lanes ending in US whose origin is MX -> tagged USMCA-Auto75
- Lanes ending in US whose origin is in FEOC (CN) -> tagged IRA-30D
- Lanes ending in PL (proxy for EU) -> tagged CBAM
- Other lanes: untagged
"""
from __future__ import annotations
import argparse
import random
from itertools import product
from pathlib import Path
from data.schemas import TradeLane

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "lanes.ndjson"
REGIONS = ["KR", "CN", "VN", "MX", "PL", "US", "IN"]
MODES = ["SEA", "AIR", "RAIL", "ROAD"]


def _regs_for(origin: str, dest: str) -> list[str]:
    regs: list[str] = []
    if dest == "US" and origin == "MX":
        regs.append("USMCA-Auto75")
    if dest == "US" and origin == "CN":
        regs.append("IRA-30D")
    if dest == "PL":
        regs.append("CBAM")
    return regs


def _transit_days(origin: str, dest: str, mode: str) -> int:
    base = {"SEA": 25, "AIR": 3, "RAIL": 18, "ROAD": 7}[mode]
    return base + (0 if origin == dest else 0)  # simplified


def generate_lanes(seed: int = 42) -> list[TradeLane]:
    rng = random.Random(seed)
    pairs = [(o, d) for o, d in product(REGIONS, REGIONS) if o != d]
    rng.shuffle(pairs)
    out: list[TradeLane] = []
    lid = 0
    while len(out) < 120:
        for o, d in pairs:
            if len(out) >= 120:
                break
            mode = rng.choice(MODES)
            lid += 1
            out.append(TradeLane(
                id=f"AMZN-LANE-{lid:04d}",
                origin_region=o,
                dest_region=d,
                mode=mode,  # type: ignore[arg-type]
                transit_days=_transit_days(o, d, mode),
                regulations=_regs_for(o, d),
            ))
    return out


def main() -> None:
    argparse.ArgumentParser().parse_args()
    lanes = generate_lanes()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for la in lanes:
            f.write(la.model_dump_json() + "\n")
    print(f"wrote {len(lanes)} → {OUTPUT.name}")


if __name__ == "__main__":
    main()
