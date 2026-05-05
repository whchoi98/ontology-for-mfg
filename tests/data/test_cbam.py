# tests/data/test_cbam.py
from data.public.cbam import load_cbam_cn_codes, load_cbam_regulation


def test_cbam_cn_codes():
    codes = load_cbam_cn_codes()
    assert len(codes) >= 5
    keys = {c["cn_code"] for c in codes}
    # CBAM Phase 1 covers iron/steel/cement/aluminium/electricity/fertilizer/hydrogen
    assert "7208" in keys or "7208 51 20" in keys  # iron/steel


def test_cbam_regulation():
    reg = load_cbam_regulation()
    assert reg.id == "CBAM"
    assert reg.region == "EU"
