from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from prioracan.config import CanUsbConfig

if TYPE_CHECKING:
    from prioracan.drivers.base import CanDriver


@dataclass(slots=True)
class CaptureSession:
    session_id: str
    start_time: float
    driver: CanDriver
    config: CanUsbConfig
    active: bool = True
    end_time: float | None = None
    stats: dict[str, Any] | None = None

    def mark_end(self, end_time: float) -> None:
        self.end_time = end_time
        self.active = False
