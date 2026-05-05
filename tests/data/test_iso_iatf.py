# tests/data/test_iso_iatf.py
from data.public.iso_iatf import load_iso_iatf_standards


def test_load_iso_iatf():
    items = load_iso_iatf_standards()
    ids = {s.id for s in items}
    assert {"IATF-16949", "ISO-26262", "ISO-9001", "ISO-14001"}.issubset(ids)
    families = {s.family for s in items}
    assert families == {"IATF", "ISO"}
