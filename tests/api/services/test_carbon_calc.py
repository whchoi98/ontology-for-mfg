# tests/api/services/test_carbon_calc.py
from api.services.carbon_calc import scope_1_2_3, cbam_calc


def test_scope_sum_positive():
    out = scope_1_2_3(plant_id="AMZN-PLANT-001",
                      direct_kg_co2=1000, electricity_kwh=5000, upstream_tons=10.5)
    assert out["scope_1_t"] > 0 and out["scope_2_t"] > 0 and out["scope_3_t"] > 0


def test_cbam_steel_lane():
    fee = cbam_calc(cn_code="7208", tons=100, eu_carbon_price_eur=80.0)
    # 100 t × 2.1 t CO2/t × 80 EUR = 16800 EUR
    assert 16000 <= fee <= 17000
