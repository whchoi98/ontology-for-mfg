# tests/data/test_boms_gen.py
from data.synthetic.boms import generate_boms
from data.schemas import Module, Component, RawMaterial


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
