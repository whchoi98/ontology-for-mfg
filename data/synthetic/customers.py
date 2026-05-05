"""B2B OEM customer accounts. 30 = AUTO_OEM 5 + TIER1 8 + APPLIANCE_DIST 7 + TELECOM 5 + OTHER 5."""
from __future__ import annotations
import argparse
from pathlib import Path
from data.schemas import CustomerAccount

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "customers.ndjson"

ACCOUNTS: list[tuple[str, str, str]] = [
    # Auto OEM (5) — anonymized
    ("Global Auto OEM A", "AUTO_OEM", "US"),
    ("Global Auto OEM B", "AUTO_OEM", "US"),
    ("EU Auto Group C",   "AUTO_OEM", "PL"),
    ("Asia Auto Maker D", "AUTO_OEM", "KR"),
    ("Premium EV Maker E","AUTO_OEM", "US"),
    # Tier-1 (8)
    ("AutoTier1-Alpha", "TIER1", "MX"),
    ("AutoTier1-Beta",  "TIER1", "US"),
    ("AutoTier1-Gamma", "TIER1", "DE"),  # represented as PL
    ("AutoTier1-Delta", "TIER1", "PL"),
    ("AutoTier1-Epsilon","TIER1", "JP"),  # represented as KR
    ("AutoTier1-Zeta",  "TIER1", "KR"),
    ("AutoTier1-Eta",   "TIER1", "CN"),
    ("AutoTier1-Theta", "TIER1", "IN"),
    # Appliance distributors (7)
    ("ApplianceDist-1", "APPLIANCE_DIST", "US"),
    ("ApplianceDist-2", "APPLIANCE_DIST", "PL"),
    ("ApplianceDist-3", "APPLIANCE_DIST", "KR"),
    ("ApplianceDist-4", "APPLIANCE_DIST", "VN"),
    ("ApplianceDist-5", "APPLIANCE_DIST", "IN"),
    ("ApplianceDist-6", "APPLIANCE_DIST", "MX"),
    ("ApplianceDist-7", "APPLIANCE_DIST", "CN"),
    # Telecom (5)
    ("Telco-NA-1", "TELECOM", "US"),
    ("Telco-EU-1", "TELECOM", "PL"),
    ("Telco-AP-1", "TELECOM", "KR"),
    ("Telco-AP-2", "TELECOM", "VN"),
    ("Telco-IN-1", "TELECOM", "IN"),
    # Other (5)
    ("Industrial-A", "OTHER", "KR"),
    ("Industrial-B", "OTHER", "MX"),
    ("Defense-A",    "OTHER", "US"),
    ("Defense-B",    "OTHER", "KR"),
    ("Medical-A",    "OTHER", "PL"),
]


def generate_customers(seed: int = 42) -> list[CustomerAccount]:
    valid_regions = {"KR", "CN", "VN", "MX", "PL", "US", "IN"}
    out: list[CustomerAccount] = []
    for i, (name, seg, region) in enumerate(ACCOUNTS, start=1):
        # Coerce non-7 regions to closest in our scope
        r = region if region in valid_regions else {"DE": "PL", "JP": "KR"}.get(region, "KR")
        out.append(CustomerAccount(
            id=f"AMZN-CUST-{i:03d}",
            name=name,
            segment=seg,  # type: ignore[arg-type]
            region=r,
        ))
    return out


def main() -> None:
    argparse.ArgumentParser().parse_args()
    customers = generate_customers()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for c in customers:
            f.write(c.model_dump_json() + "\n")
    print(f"wrote {len(customers)} → {OUTPUT.name}")


if __name__ == "__main__":
    main()
