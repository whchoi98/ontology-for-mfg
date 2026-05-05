# tests/data/test_jedec.py
from data.public.jedec import load_jedec_standards
from data.schemas import Standard

def test_load_jedec_returns_standards():
    items = load_jedec_standards()
    assert len(items) >= 8
    assert all(isinstance(s, Standard) for s in items)
    assert all(s.family == "JEDEC" for s in items)
    ids = {s.id for s in items}
    assert "JESD22" in ids
    assert "MO-220" in ids
