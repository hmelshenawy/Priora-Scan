from __future__ import annotations

import threading
from collections.abc import Iterator
from typing import Protocol, runtime_checkable

from prioracan.capabilities import DriverCapabilities
from prioracan.frame import CanFrame
from prioracan.status import DriverStatus


@runtime_checkable
class CanDriver(Protocol):
    """Vendor-independent read-only CAN driver contract.

    receive returns a CanFrame or raises CanReceiveTimeout, never None.
    iter_frames is a thin stoppable iterator over receive and owns no threads.
    disconnect is idempotent and safe against an active iter_frames call.
    This contract intentionally exposes no transmit, send, or write operation.
    """

    def connect(self) -> None: ...

    def disconnect(self) -> None: ...

    def is_connected(self) -> bool: ...

    def receive(self, timeout_seconds: float | None = None) -> CanFrame: ...

    def iter_frames(
        self, stop_event: threading.Event | None = None
    ) -> Iterator[CanFrame]: ...

    def get_status(self) -> DriverStatus: ...

    def get_capabilities(self) -> DriverCapabilities: ...


def assert_conforms(driver: object) -> None:
    forbidden = ("transmit", "send", "write")
    for name in forbidden:
        if hasattr(driver, name):
            raise TypeError(f"CanDriver must not expose {name}")
    if not isinstance(driver, CanDriver):
        raise TypeError("object does not conform to CanDriver")
