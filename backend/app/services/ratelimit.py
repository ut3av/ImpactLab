"""Thread-safe in-memory sliding-window limiter for outbound model calls (per client and global).

Memory is bounded: a client's queue never exceeds its limit, the global queue never exceeds the
global limit, and idle clients are pruned (at most ``global_limit`` clients can be active per window).
"""
from __future__ import annotations

import threading
import time
from collections import deque
from typing import Callable


class SlidingWindowLimiter:
    def __init__(self, per_client: int, global_limit: int, window_s: float = 60.0,
                 clock: Callable[[], float] = time.monotonic, prune_every: int = 256):
        if per_client < 1 or global_limit < 1 or window_s <= 0:
            raise ValueError("limits and window must be positive")
        self.per_client, self.global_limit, self.window_s = per_client, global_limit, window_s
        self.max_clients = max(1024, 2 * global_limit)
        self._clock, self._prune_every = clock, prune_every
        self._lock = threading.Lock()
        self._global: deque[float] = deque()
        self._clients: dict[str, deque[float]] = {}
        self._calls = 0

    def allow(self, key: str) -> bool:
        """Record one call for ``key`` and return True, or return False (nothing recorded) if over a limit."""
        key = (key or "anon")[:64]
        with self._lock:
            now = self._clock()
            cutoff = now - self.window_s
            while self._global and self._global[0] <= cutoff:
                self._global.popleft()
            q = self._clients.get(key)
            if q is not None:
                while q and q[0] <= cutoff:
                    q.popleft()
            self._calls += 1
            if self._calls % self._prune_every == 0 or len(self._clients) >= self.max_clients:
                self._prune(cutoff, keep=key)
            if len(self._global) >= self.global_limit or (q is not None and len(q) >= self.per_client):
                return False
            if q is None:
                q = self._clients[key] = deque()
            q.append(now)
            self._global.append(now)
            return True

    def _prune(self, cutoff: float, keep: str) -> None:
        for k in [k for k, q in self._clients.items() if k != keep and (not q or q[-1] <= cutoff)]:
            del self._clients[k]

    def __len__(self) -> int:  # number of tracked clients (for tests)
        return len(self._clients)
