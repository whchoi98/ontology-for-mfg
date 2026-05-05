# tests/data/test_us_trade.py
from data.public.us_trade import load_ira_regulation, load_usmca_regulation, FEOC_COUNTRIES, USMCA_AUTO_VALUE_CONTENT_RULES


def test_ira():
    reg = load_ira_regulation()
    assert reg.id == "IRA-30D"
    assert reg.region == "US"


def test_usmca():
    reg = load_usmca_regulation()
    assert reg.id == "USMCA-Auto75"
    assert reg.region == "US"


def test_feoc_countries():
    assert "CN" in FEOC_COUNTRIES
    assert "RU" in FEOC_COUNTRIES


def test_usmca_rule_75pct():
    assert USMCA_AUTO_VALUE_CONTENT_RULES["passenger_vehicle"] == 75
