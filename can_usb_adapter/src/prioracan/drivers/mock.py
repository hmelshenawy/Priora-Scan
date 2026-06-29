from __future__ import annotations

import threading
from collections.abc import Iterator, Sequence

from prioracan.capabilities import MOCK_CAPABILITIES, DriverCapabilities
from prioracan.config import CanUsbConfig
from prioracan.errors import CanReceiveTimeout
from prioracan.frame import CanFrame
from prioracan.status import DriverState, DriverStatus


class MockDriver:
    def __init__(
        self, frames: Sequence[CanFrame], *, config: CanUsbConfig | None = None
    ) -> None:
        self._frames = tuple(frames)
        self._config = config or CanUsbConfig()
        self._index = 0
        self._connected = False
        self._listening = False

    def connect(self) -> None:
        self._connected = True

    def disconnect(self) -> None:
        self._connected = False
        self._listening = False

    def is_connected(self) -> bool:
        return self._connected

    def receive(self, timeout_seconds: float | None = None) -> CanFrame:
        if self._index >= len(self._frames):
            raise CanReceiveTimeout("mock frame source exhausted")
        self._listening = True
        frame = self._frames[self._index]
        self._index += 1
        return frame

    def iter_frames(
        self, stop_event: threading.Event | None = None
    ) -> Iterator[CanFrame]:
        while self.is_connected() and not _is_stopped(stop_event):
            try:
                yield self.receive()
            except CanReceiveTimeout:
                return

    def get_status(self) -> DriverStatus:
        return DriverStatus(
            state=self._state(),
            adapter_name="mock",
            bitrate=self._config.bitrate,
            channel=self._config.channel,
            received_frame_count=self._index,
        )

    def get_capabilities(self) -> DriverCapabilities:
        return MOCK_CAPABILITIES

    def _state(self) -> DriverState:
        if not self._connected:
            return DriverState.DISCONNECTED
        if self._listening:
            return DriverState.LISTENING
        return DriverState.CONNECTED


def _is_stopped(stop_event: threading.Event | None) -> bool:
    return stop_event is not None and stop_event.is_set()
