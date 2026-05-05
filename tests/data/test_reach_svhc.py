# tests/data/test_reach_svhc.py
from data.public.reach_svhc import load_svhc_substances, load_reach_regulation
from data.schemas import Substance, Regulation

def test_load_svhc():
    subs = load_svhc_substances()
    assert len(subs) >= 30
    assert all(isinstance(s, Substance) for s in subs)
    assert all(s.reach_svhc for s in subs)
    cas_ids = {s.cas_id for s in subs}
    # spot-check well-known SVHC entries
    assert "117-81-7" in cas_ids   # DEHP
    assert "1303-86-2" in cas_ids  # Boric acid


def test_reach_regulation():
    reg = load_reach_regulation()
    assert isinstance(reg, Regulation)
    assert reg.id == "REACH-SVHC"
    assert reg.region == "EU"
