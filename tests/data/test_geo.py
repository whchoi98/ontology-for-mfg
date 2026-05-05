# tests/data/test_geo.py
from data.public.geo import load_regions
from data.schemas import Region


def test_load_7_regions():
    regions = load_regions()
    ids = {r.id for r in regions}
    assert ids == {"KR", "CN", "VN", "MX", "PL", "US", "IN"}
    assert all(isinstance(r, Region) for r in regions)
    kr = next(r for r in regions if r.id == "KR")
    assert kr.name_ko == "대한민국"
