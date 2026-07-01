import threading

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.session import CaptureSession, CaptureState


def test_two_mock_sessions_run_independently(deterministic_frames) -> None:
    frames_a = deterministic_frames[:2]
    frames_b = deterministic_frames[2:]
    driver_a = MockDriver(frames_a)
    driver_b = MockDriver(frames_b)
    session_a = CaptureSession("a", 1.0, driver_a, CanUsbConfig())
    session_b = CaptureSession("b", 1.0, driver_b, CanUsbConfig())

    threads = (
        threading.Thread(target=session_a.start),
        threading.Thread(target=session_b.start),
    )
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=0.5)

    assert all(thread.is_alive() is False for thread in threads)
    assert session_a._captured_frames == frames_a
    assert session_b._captured_frames == frames_b
    assert session_a._total == len(frames_a)
    assert session_b._total == len(frames_b)
    assert session_a._state is CaptureState.STOPPED
    assert session_b._state is CaptureState.STOPPED
    assert driver_a.get_status().received_frame_count == len(frames_a)
    assert driver_b.get_status().received_frame_count == len(frames_b)
    assert driver_a.is_connected() is False
    assert driver_b.is_connected() is False
