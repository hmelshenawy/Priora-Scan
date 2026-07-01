import threading
import time

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.errors import CanReceiveTimeout
from prioracan.session import CaptureSession, CaptureState


class CleanupTrackingDriver(MockDriver):
    def __init__(self, frames):
        super().__init__(frames)
        self.disconnect_calls = 0

    def disconnect(self) -> None:
        self.disconnect_calls += 1
        super().disconnect()


class StopAfterFirstDriver(CleanupTrackingDriver):
    def iter_frames(self, stop_event=None):
        for frame in super().iter_frames(stop_event):
            yield frame
            if stop_event is not None:
                stop_event.set()


class BlockingUntilStoppedDriver(CleanupTrackingDriver):
    def iter_frames(self, stop_event=None):
        while self.is_connected() and not stop_event.is_set():
            time.sleep(0.001)
        return
        yield


def test_mock_capture_to_exhaustion_counts_in_order(deterministic_frames) -> None:
    session = CaptureSession("s1", 1.0, MockDriver(deterministic_frames), CanUsbConfig())
    session.start()
    assert session._total == len(deterministic_frames)
    assert session._captured_frames == deterministic_frames
    assert session._state is CaptureState.STOPPED


def test_stop_event_observed_between_frames(deterministic_frames) -> None:
    driver = StopAfterFirstDriver(deterministic_frames)
    session = CaptureSession("s1", 1.0, driver, CanUsbConfig())
    session.start()
    assert session._total == 1
    assert session._state is CaptureState.STOPPED


def test_empty_capture_cleans_up() -> None:
    driver = CleanupTrackingDriver(())
    session = CaptureSession("s1", 1.0, driver, CanUsbConfig())
    session.start()
    assert session._total == 0
    assert driver.disconnect_calls == 1
    assert driver.is_connected() is False


def test_cleanup_runs_when_capture_errors(deterministic_frames) -> None:
    class FailingDriver(CleanupTrackingDriver):
        def iter_frames(self, stop_event=None):
            raise CanReceiveTimeout("boom")
            yield

    driver = FailingDriver(deterministic_frames)
    session = CaptureSession("s1", 1.0, driver, CanUsbConfig())
    try:
        session.start()
    except CanReceiveTimeout:
        pass
    assert driver.disconnect_calls == 1
    assert session._state is CaptureState.STOPPED


def test_bounded_cancellation_while_blocked() -> None:
    driver = BlockingUntilStoppedDriver(())
    session = CaptureSession(
        "s1", 1.0, driver, CanUsbConfig(), stop_timeout_seconds=0.2
    )
    worker = threading.Thread(target=session.start)
    worker.start()
    deadline = time.monotonic() + 0.2
    while not session.is_running and time.monotonic() < deadline:
        time.sleep(0.001)
    started = time.monotonic()
    session.stop()
    worker.join(timeout=0.5)
    assert worker.is_alive() is False
    assert time.monotonic() - started <= session.stop_timeout_seconds
    assert session._state is CaptureState.STOPPED
