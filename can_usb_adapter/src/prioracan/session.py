from __future__ import annotations

import threading
import time
from collections.abc import Sequence
from enum import Enum, auto
from typing import TYPE_CHECKING, Any

from prioracan.config import CanUsbConfig
from prioracan.errors import CanAdapterError, CanLoggingError
from prioracan.statistics import CaptureStatistics

if TYPE_CHECKING:
    from prioracan.drivers.base import CanDriver
    from prioracan.frame import CanFrame
    from prioracan.logging import FrameLogger


class CaptureState(Enum):
    CREATED = auto()
    STARTING = auto()
    RUNNING = auto()
    STOPPING = auto()
    STOPPED = auto()
    DISPOSED = auto()


class CaptureSession:
    """Runtime owner for one receive-only CAN capture lifecycle."""

    def __init__(
        self,
        session_id: str,
        start_time: float,
        driver: CanDriver,
        config: CanUsbConfig,
        *,
        loggers: Sequence[FrameLogger] = (),
        stop_timeout_seconds: float | None = None,
    ) -> None:
        self.session_id = session_id
        self.start_time = start_time
        self.driver = driver
        self.config = config
        self.active = True
        self.end_time: float | None = None
        self.stats: dict[str, Any] | None = None
        self.loggers = tuple(loggers)
        self.stop_timeout_seconds = _stop_timeout(config, stop_timeout_seconds)
        self._state = CaptureState.CREATED
        self._stop_event = threading.Event()
        self._capture_stats = None
        self._total = 0
        self._rx = 0
        self._tx = 0
        self._dropped = 0
        self._capture_started_at = start_time
        self._captured_frames: list[CanFrame] = []
        self._opened_loggers: list[FrameLogger] = []
        self._failed_logger: FrameLogger | None = None

    def mark_end(self, end_time: float) -> None:
        self.end_time = end_time
        self.active = False

    @property
    def is_running(self) -> bool:
        """Return True only while the capture loop is actively running."""
        return self._state is CaptureState.RUNNING

    @property
    def statistics(self) -> CaptureStatistics | None:
        """Return finalized capture statistics, or None before capture ends."""
        return self._capture_stats

    def start(self) -> CaptureStatistics:
        """Start the capture loop and return finalized statistics when it ends."""
        self._ensure_usable()
        if self._state is not CaptureState.CREATED:
            raise CanAdapterError("capture session can only be started once")
        self._state = CaptureState.STARTING
        self._stop_event.clear()
        self._reset_counters()
        self._captured_frames = []
        try:
            self._open_loggers()
            self.driver.connect()
            self._capture_started_at = time.monotonic()
            self._state = CaptureState.RUNNING
            self._capture_loop()
        finally:
            self._finish_capture()
        return self._capture_stats

    def stop(self) -> CaptureStatistics:
        """Request capture stop and return finalized statistics."""
        self._ensure_usable()
        if self._state is CaptureState.CREATED:
            self._finish_capture()
            return self._capture_stats
        if self._state is CaptureState.STOPPED:
            return self._capture_stats
        self._stop_event.set()
        if self._state is CaptureState.RUNNING:
            self._state = CaptureState.STOPPING
        self._wait_until_stopped()
        return self._capture_stats

    def __enter__(self) -> CaptureSession:
        """Enter a context-managed capture lifecycle without auto-starting."""
        self._ensure_usable()
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        """Stop capture if needed and mark the session disposed."""
        if self._state is not CaptureState.DISPOSED:
            if self._state is not CaptureState.STOPPED:
                self.stop()
            self._state = CaptureState.DISPOSED

    def _capture_loop(self) -> None:
        for frame in self.driver.iter_frames(self._stop_event):
            if self._stop_event.is_set():
                break
            self._captured_frames.append(frame)
            self._count_frame(frame)
            self._dispatch(frame)

    def _dispatch(self, frame: CanFrame) -> None:
        for logger in self.loggers:
            try:
                logger.write_frame(frame)
            except (CanLoggingError, OSError) as exc:
                self._failed_logger = logger
                self._state = CaptureState.STOPPING
                self._stop_event.set()
                if isinstance(exc, CanLoggingError):
                    raise
                raise CanLoggingError(str(exc)) from exc

    def _finish_capture(self) -> None:
        if self._state in (CaptureState.RUNNING, CaptureState.STARTING):
            self._state = CaptureState.STOPPING
        self._stop_event.set()
        try:
            self.driver.disconnect()
        finally:
            close_error = self._close_loggers()
            end_time = self._capture_end_time()
            self._capture_stats = CaptureStatistics.build(
                self._capture_started_at,
                end_time,
                total_frames=self._total,
                rx_frames=self._rx,
                tx_frames=self._tx,
                dropped_frames=self._dropped,
            )
            self.mark_end(end_time)
            self._state = CaptureState.STOPPED
            if close_error is not None:
                raise close_error

    def _count_frame(self, frame: CanFrame) -> None:
        self._total += 1
        if frame.direction.value == "RX":
            self._rx += 1
        elif frame.direction.value == "TX":
            self._tx += 1

    def _reset_counters(self) -> None:
        self._total = 0
        self._rx = 0
        self._tx = 0
        self._dropped = 0
        self._capture_stats = None

    def _capture_end_time(self) -> float:
        end_time = time.monotonic()
        if self._total > 0 and end_time <= self._capture_started_at:
            return self._capture_started_at + 1e-9
        return end_time

    def _open_loggers(self) -> None:
        for logger in self.loggers:
            try:
                logger.open()
            except (CanLoggingError, OSError) as exc:
                self._failed_logger = logger
                if isinstance(exc, CanLoggingError):
                    raise
                raise CanLoggingError(str(exc)) from exc
            self._opened_loggers.append(logger)

    def _close_loggers(self) -> CanLoggingError | None:
        close_error = None
        for logger in self._opened_loggers:
            if logger is self._failed_logger:
                continue
            try:
                logger.close()
            except (CanLoggingError, OSError) as exc:
                if close_error is None:
                    close_error = _logging_error(exc)
        self._opened_loggers = []
        return close_error

    def _wait_until_stopped(self) -> None:
        deadline = time.monotonic() + self.stop_timeout_seconds
        while self._state is not CaptureState.STOPPED:
            if time.monotonic() >= deadline:
                break
            time.sleep(0.001)

    def _ensure_usable(self) -> None:
        if self._state is CaptureState.DISPOSED:
            raise CanAdapterError("capture session is disposed")


def _stop_timeout(config: CanUsbConfig, explicit: float | None) -> float:
    timeout = config.receive_timeout_seconds if explicit is None else explicit
    if timeout < 0:
        raise CanAdapterError("stop timeout must be non-negative")
    return timeout


def _logging_error(exc: CanLoggingError | OSError) -> CanLoggingError:
    if isinstance(exc, CanLoggingError):
        return exc
    return CanLoggingError(str(exc))
