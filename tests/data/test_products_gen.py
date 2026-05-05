# tests/data/test_products_gen.py
from data.synthetic.products import generate_products
from data.schemas import Product


def test_generate_80_products_5_lines():
    products = generate_products(seed=42)
    assert len(products) == 80
    assert all(isinstance(p, Product) for p in products)
    lines = {p.line for p in products}
    assert lines == {"SmartFridge", "VisionOLED", "AutoCockpit", "FC-BGA", "eDrive"}
    # Each line has ~16 SKUs (allow small variance)
    from collections import Counter
    line_counts = Counter(p.line for p in products)
    assert all(14 <= c <= 18 for c in line_counts.values())


def test_product_id_format():
    products = generate_products(seed=42)
    # AMZN-{division}-{line}-{NNN}
    assert all(p.id.startswith("AMZN-") for p in products)
    he = [p for p in products if p.line == "VisionOLED"]
    assert all(p.id.startswith("AMZN-HE-VisionOLED-") for p in he)
