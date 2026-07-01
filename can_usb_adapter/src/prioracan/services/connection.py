from __future__ import annotations

from collections.abc import Sequence

from prioracan.drivers.base import CanDriver
from prioracan.frame import CanFrame
from prioracan.logging.base import FrameLogger
from prioracan.status import DriverStatus


class ConnectionService:
    """Thin orchestrator for one driver and optional frame loggers."""

    def __init__(
        self, driver: CanDriver, loggers: Sequence[FrameLogger] | None = None
    ) -> None:
        self._driver = driver
        self._loggers = tuple(loggers or ())

    def connect(self) -> None:
        for logger in self._loggers:
            logger.open()
        self._driver.connect()

    def receive_once(self) -> CanFrame:
        frame = self._driver.receive()
        for logger in self._loggers:
            logger.write_frame(frame)
        return frame

    def get_status(self) -> DriverStatus:
        return self._driver.get_status()

    def disconnect(self) -> None:
        self._driver.disconnect()
        for logger in self._loggers:
            logger.close()
