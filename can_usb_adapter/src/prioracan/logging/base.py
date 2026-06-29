from typing import Protocol, runtime_checkable

from prioracan.frame import CanFrame


@runtime_checkable
class FrameLogger(Protocol):
    """Logger contract independent of drivers; close must be safe after errors."""

    def open(self) -> None: ...

    def write_frame(self, frame: CanFrame) -> None: ...

    def close(self) -> None: ...
