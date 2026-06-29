"""Shared adapter command lock helpers.

All callers that talk to one physical ELM327 adapter must coordinate through
the same re-entrant lock. This prevents live-data polling from interleaving
TX/RX cycles with scan, vehicle-data, DTC clear, or discovery operations.
"""

from __future__ import annotations

from contextlib import contextmanager
from threading import RLock
from typing import Iterator


_LOCK_ATTR = "_command_lock"


def get_adapter_lock(adapter) -> RLock:
    """Return the per-adapter command lock, creating it lazily if needed."""
    lock = getattr(adapter, _LOCK_ATTR, None)
    if lock is None:
        lock = RLock()
        setattr(adapter, _LOCK_ATTR, lock)
    return lock


@contextmanager
def adapter_command_lock(adapter) -> Iterator[None]:
    """Hold the adapter command lock for a command or full operation."""
    lock = get_adapter_lock(adapter)
    lock.acquire()
    try:
        yield
    finally:
        lock.release()
