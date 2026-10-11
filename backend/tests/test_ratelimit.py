"""Sliding-window limiter for outbound model calls."""
import threading

import pytest

from app.services.ratelimit import SlidingWindowLimiter


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def test_per_client_and_global_limits_slide():
    clock = Clock()
    rl = SlidingWindowLimiter(per_client=2, global_limit=3, window_s=60, clock=clock)
    assert rl.allow("a") and rl.allow("a") and not rl.allow("a")  # per client
    assert rl.allow("b") and not rl.allow("c")                    # global
    clock.t += 59.9
    assert not rl.allow("c")
    clock.t += 0.2                                                # first calls left the window
    assert rl.allow("c") and rl.allow("a")


def test_memory_is_bounded():
    clock = Clock()
    rl = SlidingWindowLimiter(per_client=1, global_limit=5, window_s=60, clock=clock, prune_every=10)
    for i in range(5000):
        clock.t += 13  # each client is idle again by the time it is pruned
        rl.allow(f"client-{i}")
    assert len(rl) <= rl.max_clients
    assert len(rl) < 50


def test_thread_safe_global_cap():
    rl = SlidingWindowLimiter(per_client=1000, global_limit=50, window_s=60)
    results: list[bool] = []
    lock = threading.Lock()

    def worker(n):
        for _ in range(20):
            ok = rl.allow(f"c{n}")
            with lock:
                results.append(ok)

    threads = [threading.Thread(target=worker, args=(n,)) for n in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sum(results) == 50


def test_rejects_bad_config():
    with pytest.raises(ValueError):
        SlidingWindowLimiter(per_client=0, global_limit=1)
