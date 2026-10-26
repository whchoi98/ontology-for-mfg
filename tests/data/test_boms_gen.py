# tests/data/test_boms_gen.py
from data.schemas import Component, Module, RawMaterial
from data.synthetic.boms import generate_boms


def test_generate_bom_counts():
    products = ["AMZN-HE-VisionOLED-001"] * 80  # mock 80 product ids
    bom = generate_boms(product_ids=products, seed=42)
    assert 380 <= len(bom["modules"]) <= 420
    assert 2900 <= len(bom["components"]) <= 3100
    assert 180 <= len(bom["raw_materials"]) <= 220
    assert all(isinstance(m, Module) for m in bom["modules"])
    assert all(isinstance(c, Component) for c in bom["components"])
    assert all(isinstance(r, RawMaterial) for r in bom["raw_materials"])


def test_bom_edges_consistent():
    products = ["AMZN-HE-VisionOLED-001"] * 80
    bom = generate_boms(product_ids=products, seed=42)
    # Every Module references at least one parent product
    assert all(len(m.parent_product_ids) >= 1 for m in bom["modules"])


def test_demo_hero_component_exists():
    """Demo samples (/chat, /compliance, /substitute, /price, Manny) all start from
    AMZN-CMP-IC-00001. With the global counter the first IC was IC-00012, so the hero
    part never existed in Neptune and every one of those demos fell back to synthetic."""
    products = ["AMZN-HE-VisionOLED-001"] * 80
    comps = generate_boms(product_ids=products, seed=42)["components"]
    hero = [c for c in comps if c.id == "AMZN-CMP-IC-00001"]
    assert len(hero) == 1 and hero[0].category == "IC"
    assert len({c.id for c in comps}) == len(comps)
