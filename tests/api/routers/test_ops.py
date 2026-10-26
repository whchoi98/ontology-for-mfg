# tests/api/routers/test_ops.py
"""B11: /ops/eval must not mutate the shared cached response per request."""

from __future__ import annotations

import time
from unittest.mock import patch

import pytest

from api.routers import ops


@pytest.fixture
def _seeded_cache():
    saved = dict(ops._eval_cache)
    cached = ops.EvalResponse(
        pass_rate=1.0,
        passes=1,
        total=1,
        avg_latency_ms=10,
        cached_at_unix=int(time.time()),
        rows=[],
        history=[],
    )
    ops._eval_cache.update({"updated_at": time.time(), "result": cached})
    try:
        yield cached
    finally:
        ops._eval_cache.clear()
        ops._eval_cache.update(saved)


def _hist(n: int) -> list[dict]:
    return [
        {
            "run_id": f"r{i}",
            "ts": i,
            "pass_rate": 1.0,
            "passes": 1,
            "total": 1,
            "avg_latency_ms": 10,
        }
        for i in range(n)
    ]


def test_eval_cached_path_returns_per_request_copy(_seeded_cache):
    with patch("api.routers.ops._load_eval_history", side_effect=lambda limit: _hist(limit)):
        r1 = ops.eval_status(run=False, history_limit=1)
        r2 = ops.eval_status(run=False, history_limit=3)
    assert r1 is not r2
    assert len(r1.history) == 1
    assert len(r2.history) == 3
    # The shared cached object itself is never mutated.
    assert _seeded_cache.history == []
    assert ops._eval_cache["result"] is _seeded_cache


def test_eval_fresh_run_does_not_leak_history_into_cache():
    saved = dict(ops._eval_cache)
    try:
        ops._eval_cache.update({"updated_at": 0.0, "result": None})
        with (
            patch("api.routers.ops.get_search", side_effect=RuntimeError("no aoss")),
            patch("api.routers.ops._persist_eval_run"),
            patch("api.routers.ops._load_eval_history", side_effect=lambda limit: _hist(limit)),
        ):
            r = ops.eval_status(run=True, history_limit=2)
        assert len(r.history) == 2
        assert ops._eval_cache["result"] is not r
        assert ops._eval_cache["result"].history == []
    finally:
        ops._eval_cache.clear()
        ops._eval_cache.update(saved)
