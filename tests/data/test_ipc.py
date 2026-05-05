# tests/data/test_ipc.py
from data.public.ipc import load_ipc_standards


def test_load_ipc():
    items = load_ipc_standards()
    assert len(items) >= 5
    assert all(s.family == "IPC" for s in items)
    assert "IPC-A-610" in {s.id for s in items}
