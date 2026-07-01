import pytest

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.errors import CanLoggingError
from prioracan.session import CaptureSession, CaptureState


class RecordingLogger:
    def __init__(self) -> None:
        self.opened = False
        self.closed = False
        self.frames = []

    def open(self) -> None:
        self.opened = True

    def write_frame(self, frame) -> None:
        self.frames.append(frame)

    def close(self) -> None:
        self.closed = True


class FailingLogger(RecordingLogger):
    def __init__(self, *, fail_on_open: bool = False, fail_on_frame: int = 1) -> None:
        super().__init__()
        self.fail_on_open = fail_on_open
        self.fail_on_frame = fail_on_frame

    def open(self) -> None:
        if self.fail_on_open:
            raise CanLoggingError("open failed")
        super().open()

    def write_frame(self, frame) -> None:
        if len(self.frames) + 1 >= self.fail_on_frame:
            raise CanLoggingError("frame failed")
        super().write_frame(frame)


def test_frame_logging_failure_stops_and_closes_remaining(deterministic_frames) -> None:
    failing = FailingLogger(fail_on_frame=2)
    remaining = RecordingLogger()
    driver = MockDriver(deterministic_frames)
    session = CaptureSession(
        "s1", 1.0, driver, CanUsbConfig(), loggers=(failing, remaining)
    )

    with pytest.raises(CanLoggingError):
        session.start()

    assert failing.frames == [deterministic_frames[0]]
    assert remaining.frames == [deterministic_frames[0]]
    assert remaining.closed is True
    assert driver.is_connected() is False
    assert session._total == 2
    assert session._state is CaptureState.STOPPED
    assert session.is_running is False


def test_logger_open_failure_aborts_before_capture(deterministic_frames) -> None:
    failing = FailingLogger(fail_on_open=True)
    remaining = RecordingLogger()
    driver = MockDriver(deterministic_frames)
    session = CaptureSession(
        "s1", 1.0, driver, CanUsbConfig(), loggers=(failing, remaining)
    )

    with pytest.raises(CanLoggingError):
        session.start()

    assert remaining.opened is False
    assert remaining.closed is False
    assert driver.is_connected() is False
    assert session._total == 0
    assert session._state is CaptureState.STOPPED
