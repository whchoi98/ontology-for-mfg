# tests/data/test_rohs.py
from data.public.rohs import load_rohs_substances, load_rohs_regulation


def test_rohs_count_10():
    subs = load_rohs_substances()
    assert len(subs) == 10  # 6 original + 4 phthalates added 2019
    assert all(s.rohs_restricted for s in subs)


def test_rohs_includes_lead_and_dehp():
    subs = load_rohs_substances()
    cas_ids = {s.cas_id for s in subs}
    assert "7439-92-1" in cas_ids   # Lead
    assert "117-81-7" in cas_ids    # DEHP


def test_rohs_regulation():
    reg = load_rohs_regulation()
    assert reg.id == "RoHS"
    assert reg.region == "EU"
