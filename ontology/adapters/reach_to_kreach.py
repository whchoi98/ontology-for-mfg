# ontology/adapters/reach_to_kreach.py
"""REACH SVHC -> K-REACH (한국 화학물질의 등록 및 평가 등에 관한 법률) status mapping.

K-REACH adopts most EU REACH SVHC entries with a delta. Entries here represent
which CAS IDs are registered/exempt under K-REACH for demo purposes.
"""
from __future__ import annotations


def reach_svhc_to_kreach() -> dict[str, dict]:
    # cas_id -> {status, k_reach_id (optional)}
    return {
        "117-81-7":  {"status": "registered", "k_reach_id": "KE-12345"},
        "84-69-5":   {"status": "registered", "k_reach_id": "KE-12346"},
        "1303-86-2": {"status": "registered", "k_reach_id": "KE-12347"},
        "7440-43-9": {"status": "registered", "k_reach_id": "KE-12348"},
        "7439-92-1": {"status": "registered", "k_reach_id": "KE-12349"},
        "75-09-2":   {"status": "exempt", "k_reach_id": None},  # not yet adopted
        "1330-43-4": {"status": "registered", "k_reach_id": "KE-12350"},
    }
