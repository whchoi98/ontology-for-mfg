# tests/ontology/test_adapters.py
from ontology.adapters.jedec_to_ks import jedec_to_ks_mapping
from ontology.adapters.reach_to_kreach import reach_svhc_to_kreach
from ontology.adapters.cbam_to_kets import cbam_cn_to_kets_factor


def test_jedec_to_ks():
    m = jedec_to_ks_mapping()
    assert m["JESD22"] == "KS C IEC 60749"


def test_reach_to_kreach():
    m = reach_svhc_to_kreach()
    # K-REACH wraps EU REACH SVHC list with delta
    assert "117-81-7" in m
    assert m["117-81-7"]["status"] == "registered"


def test_cbam_to_kets_factor():
    # Example: EU CBAM CN 7208 (steel) -> K-ETS conversion factor (tonCO2e/ton)
    factor = cbam_cn_to_kets_factor("7208")
    assert factor > 0
