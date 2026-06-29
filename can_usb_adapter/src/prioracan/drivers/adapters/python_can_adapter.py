from __future__ import annotations

from typing import Any

import can

from prioracan.config import CanUsbConfig
from prioracan.errors import (
    CanAdapterError,
    CanConfigurationError,
    CanConnectionError,
    CanDeviceNotFoundError,
    CanDriverNotFoundError,
    CanPermissionError,
)


class PythonCanAdapter:
    def __init__(self) -> None:
        self._bus: Any | None = None

    def open(self, config: CanUsbConfig) -> None:
        try:
            self._bus = can.Bus(
                interface=config.interface,
                channel=config.channel,
                bitrate=config.bitrate,
                receive_own_messages=False,
            )
        except Exception as exc:
            raise _map_open_error(exc) from exc

    def recv(self, timeout_seconds: float | None) -> Any | None:
        if self._bus is None:
            raise CanConnectionError("CAN bus is not open")
        try:
            return self._bus.recv(timeout=timeout_seconds)
        except Exception as exc:
            raise _map_runtime_error(exc) from exc

    def close(self) -> None:
        if self._bus is None:
            return
        bus = self._bus
        self._bus = None
        try:
            bus.shutdown()
        except Exception as exc:
            raise _map_runtime_error(exc) from exc

    def is_open(self) -> bool:
        return self._bus is not None


def _map_open_error(exc: Exception) -> CanAdapterError:
    message = str(exc).lower()
    if _contains(message, "permission", "access denied", "claim interface"):
        return CanPermissionError(str(exc))
    if _contains(message, "not found", "no device", "device not connected"):
        return CanDeviceNotFoundError(str(exc))
    if _contains(message, "unknown interface", "invalid", "bitrate", "channel"):
        return CanConfigurationError(str(exc))
    if _contains(message, "backend", "driver", "interface is not supported"):
        return CanDriverNotFoundError(str(exc))
    return CanAdapterError(str(exc))


def _map_runtime_error(exc: Exception) -> CanAdapterError:
    message = str(exc).lower()
    if _contains(message, "permission", "access denied", "claim interface"):
        return CanPermissionError(str(exc))
    if _contains(message, "disconnected", "connection", "shutdown", "closed"):
        return CanConnectionError(str(exc))
    return CanAdapterError(str(exc))


def _contains(message: str, *needles: str) -> bool:
    return any(needle in message for needle in needles)
