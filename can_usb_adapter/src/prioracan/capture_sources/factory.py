from __future__ import annotations

import logging
from pathlib import Path

from prioracan.capture_sources.asc_loader import load_asc_frames
from prioracan.config import CanUsbConfig
from prioracan.configuration.source import CaptureSourceConfig, load_capture_source_config
from prioracan.drivers.base import CanDriver
from prioracan.drivers.gs_usb import GsUsbDriver
from prioracan.drivers.mock import MockDriver


LOGGER = logging.getLogger(__name__)


class CaptureSourceFactory:
    """Select the configured CanDriver without changing CaptureSession."""

    def __init__(self, config: CaptureSourceConfig | None = None) -> None:
        self._config = config or load_capture_source_config()

    @classmethod
    def from_environment(cls) -> CaptureSourceFactory:
        return cls(load_capture_source_config())

    def create_driver(self) -> CanDriver:
        if self._config.source == "MOCK":
            return self._create_mock_driver()
        return self._create_real_driver()

    def create_config(self) -> CanUsbConfig:
        return CanUsbConfig(
            interface=self._config.interface,
            channel=self._config.channel,
            bitrate=self._config.bitrate,
        )

    def _create_mock_driver(self) -> MockDriver:
        trace_path = _resolve_trace_path(self._config.mock_trace)
        if not trace_path.exists():
            LOGGER.warning("CAN_MOCK_TRACE does not exist: %s", trace_path)
            return MockDriver((), config=self.create_config())
        return MockDriver(load_asc_frames(trace_path), config=self.create_config())

    def _create_real_driver(self) -> GsUsbDriver:
        return GsUsbDriver(self.create_config())


def _resolve_trace_path(path: Path) -> Path:
    if path.is_absolute():
        return path
    return Path.cwd() / path
