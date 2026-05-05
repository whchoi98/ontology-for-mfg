# tests/data/test_enrich_components.py
from data.synthetic.enrich_components import enrich_components_with_standards
from data.schemas import Component


def test_enrich_assigns_standards():
    base = [
        Component(id="AMZN-CMP-IC-00001", name="MCU", category="IC"),
        Component(id="AMZN-CMP-PCB-00002", name="PCB", category="PCB"),
        Component(id="AMZN-CMP-MEC-00003", name="Bracket", category="Mechanical"),
    ]
    enriched = enrich_components_with_standards(base, seed=42)
    # IC components must reference at least one of AEC-Q100/JESD22
    ic = next(c for c in enriched if c.category == "IC")
    assert any(s in ic.standards for s in ("AEC-Q100", "JESD22"))
    # PCB must reference IPC-A-610
    pcb = next(c for c in enriched if c.category == "PCB")
    assert "IPC-A-610" in pcb.standards


def test_some_components_carry_substances():
    base = [Component(id=f"AMZN-CMP-IC-{i:05d}", name=f"IC-{i}", category="IC") for i in range(100)]
    enriched = enrich_components_with_standards(base, seed=42)
    n_with_subs = sum(1 for c in enriched if c.substances)
    # At least 5% should carry SVHC/RoHS substances (deliberate seeding for E scenario)
    assert n_with_subs >= 5
