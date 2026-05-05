from data.synthetic.manufacturers import generate_manufacturers


def test_4_manufacturers():
    out = generate_manufacturers()
    assert len(out) == 4
    divs = {m.division for m in out}
    # Note: INNOTEK and MAGNA are unified under "INNOTEK" division for the
    # 4 사업부 (가전 H&A / TV HE / VS 전장 / 부품 = Innotek + Magna JV)
    assert divs == {"HA", "HE", "VS", "INNOTEK"}
    assert all(m.id.startswith("AMZN-MFG-") for m in out)
