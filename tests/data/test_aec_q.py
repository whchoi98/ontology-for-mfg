# tests/data/test_aec_q.py
from data.public.aec_q import load_aec_q_standards


def test_load_aec_q():
    items = load_aec_q_standards()
    assert {"AEC-Q100", "AEC-Q101", "AEC-Q200"}.issubset({s.id for s in items})
    assert all(s.family == "AEC-Q" for s in items)
