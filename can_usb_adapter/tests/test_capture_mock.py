import threading

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.session import CaptureSession, CaptureState


def run_capture(frames):
    session = CaptureSession("mock", 1.0, MockDriver(frames), CanUsbConfig())
    session.start()
    return session


def test_empty_mock_capture_finishes_without_hardware_or_files() -> None:
    errors = []
    sessions = []

    def target() -> None:
        try:
            sessions.append(run_capture(()))
        except Exception as exc:  # pragma: no cover - assertion reports type
            errors.append(exc)

    worker = threading.Thread(target=target)
    worker.start()
    worker.join(timeout=0.5)

    assert worker.is_alive() is False
    assert errors == []
    assert sessions[0]._total == 0
    assert sessions[0]._captured_frames == []
    assert sessions[0]._state is CaptureState.STOPPED


def test_mock_exhaustion_terminates_cleanly(deterministic_frames) -> None:
    session = run_capture(deterministic_frames)

    assert session._total == len(deterministic_frames)
    assert session._captured_frames == deterministic_frames
    assert session.driver.is_connected() is False
    assert session._state is CaptureState.STOPPED


def test_repeated_mock_captures_are_identical(deterministic_frames) -> None:
    first = run_capture(deterministic_frames)
    second = run_capture(deterministic_frames)

    assert first._captured_frames == second._captured_frames
    assert first._total == second._total == len(deterministic_frames)
    assert first._state is second._state is CaptureState.STOPPED


def test_mock_capture_uses_no_external_trace_file(deterministic_frames) -> None:
    session = run_capture(deterministic_frames)

    assert session._captured_frames == deterministic_frames
    assert all(frame in deterministic_frames for frame in session._captured_frames)
