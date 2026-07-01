import pytest

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.errors import CanAdapterError
from prioracan.session import CaptureSession, CaptureState
from tests.fixtures.frames import make_standard_frame


def make_running_session(driver: MockDriver) -> CaptureSession:
    session = CaptureSession("tx", 1.0, driver, CanUsbConfig())
    driver.connect()
    session._state = CaptureState.RUNNING
    return session


def test_mock_records_exact_frame_and_session_counts_tx() -> None:
    driver = MockDriver(())
    session = make_running_session(driver)
    frame = make_standard_frame(0x123, b"\x01\x02")

    session.send_frame(frame)

    assert driver.sent_frames == [frame]
    assert session._tx == 1
    assert session._rx == 0
    assert session.statistics is None


@pytest.mark.parametrize(
    "state",
    [CaptureState.CREATED, CaptureState.STOPPED, CaptureState.DISPOSED],
)
def test_session_rejects_send_frame_when_not_running(state: CaptureState) -> None:
    session = CaptureSession("tx", 1.0, MockDriver(()), CanUsbConfig())
    session._state = state

    with pytest.raises(CanAdapterError):
        session.send_frame(make_standard_frame(0x123, b"\x01"))


def test_capture_behavior_still_counts_received_frames(deterministic_frames) -> None:
    session = CaptureSession("rx", 1.0, MockDriver(deterministic_frames), CanUsbConfig())

    stats = session.start()

    assert stats.total_frames == len(deterministic_frames)
    assert stats.rx_frames == len(deterministic_frames)
    assert stats.tx_frames == 0
