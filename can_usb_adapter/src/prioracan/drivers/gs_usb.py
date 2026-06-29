from __future__ import annotations

import threading
from collections.abc import Iterator

from prioracan.capabilities import GS_USB_CAPABILITIES, DriverCapabilities
from prioracan.config import CanUsbConfig
from prioracan.drivers.adapters import PythonCanAdapter
from prioracan.errors import CanAdapterError, CanReceiveTimeout
from prioracan.frame import CanFrame, Direction
from prioracan.status import DriverState, DriverStatus


class GsUsbDriver:
    def __init__(self, config: CanUsbConfig) -> None:
        self._config = config
        self._adapter = PythonCanAdapter()
        self._received_frame_count = 0
        self._last_error: CanAdapterError | None = None
        self._listening = False

    def connect(self) -> None:
        try:
            if not self.is_connected():
                self._adapter.open(self._config)
            self._last_error = None
        except CanAdapterError as exc:
            self._last_error = exc
            raise

    def disconnect(self) -> None:
        try:
            self._adapter.close()
        finally:
            self._listening = False

    def is_connected(self) -> bool:
        return self._adapter.is_open()

    def receive(self, timeout_seconds: float | None = None) -> CanFrame:
        timeout = self._config.receive_timeout_seconds if timeout_seconds is None else timeout_seconds
        message = self._adapter.recv(timeout)
        if message is None:
            raise CanReceiveTimeout("no CAN frame received before timeout")
        frame = self._message_to_frame(message)
        self._received_frame_count += 1
        self._listening = True
        return frame

    def iter_frames(
        self, stop_event: threading.Event | None = None
    ) -> Iterator[CanFrame]:
        while self.is_connected() and not _is_stopped(stop_event):
            yield self.receive()

    def get_status(self) -> DriverStatus:
        state = self._state()
        return DriverStatus(
            state=state,
            adapter_name=self._config.interface,
            bitrate=self._config.bitrate,
            channel=self._config.channel,
            last_error=self._last_error,
            received_frame_count=self._received_frame_count,
        )

    def get_capabilities(self) -> DriverCapabilities:
        return GS_USB_CAPABILITIES

    def _message_to_frame(self, message: object) -> CanFrame:
        data = bytes(getattr(message, "data", b""))
        return CanFrame(
            timestamp=float(getattr(message, "timestamp", 0.0)),
            channel=getattr(message, "channel", self._config.channel),
            direction=Direction.RX,
            arbitration_id=int(getattr(message, "arbitration_id")),
            is_extended_id=bool(getattr(message, "is_extended_id", False)),
            is_remote_frame=bool(getattr(message, "is_remote_frame", False)),
            is_error_frame=bool(getattr(message, "is_error_frame", False)),
            dlc=int(getattr(message, "dlc", len(data))),
            data=data,
            bitrate=self._config.bitrate,
        )

    def _state(self) -> DriverState:
        if self._last_error is not None:
            return DriverState.ERROR
        if not self.is_connected():
            return DriverState.DISCONNECTED
        if self._listening:
            return DriverState.LISTENING
        return DriverState.CONNECTED


def _is_stopped(stop_event: threading.Event | None) -> bool:
    return stop_event is not None and stop_event.is_set()
