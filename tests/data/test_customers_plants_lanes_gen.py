# tests/data/test_customers_plants_lanes_gen.py
from data.synthetic.customers import generate_customers
from data.synthetic.plants import generate_plants
from data.synthetic.lanes import generate_lanes


def test_customers_30_segments():
    customers = generate_customers(seed=42)
    assert len(customers) == 30
    from collections import Counter
    seg = Counter(c.segment for c in customers)
    assert seg["AUTO_OEM"] == 5
    assert seg["TIER1"] == 8
    assert seg["APPLIANCE_DIST"] == 7
    assert seg["TELECOM"] == 5
    assert seg["OTHER"] == 5


def test_plants_40_with_self_and_supplier():
    plants = generate_plants(seed=42)
    assert len(plants) == 40
    self_plants = [p for p in plants if p.operator == "SELF"]
    supp_plants = [p for p in plants if p.operator == "SUPPLIER"]
    assert 10 <= len(self_plants) <= 20
    assert 20 <= len(supp_plants) <= 30


def test_lanes_120_multimodal():
    lanes = generate_lanes(seed=42)
    assert len(lanes) == 120
    modes = {lane.mode for lane in lanes}
    assert {"SEA", "AIR", "RAIL", "ROAD"}.issubset(modes)
    # IRA/USMCA/CBAM tagged on relevant lanes
    has_ira = any("IRA-30D" in lane.regulations for lane in lanes)
    has_cbam = any("CBAM" in lane.regulations for lane in lanes)
    has_usmca = any("USMCA-Auto75" in lane.regulations for lane in lanes)
    assert has_ira and has_cbam and has_usmca
