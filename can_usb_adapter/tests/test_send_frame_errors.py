import pytest

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.errors import CanAdapterError, CanConnectionError
from prioracan.session import CaptureSession, CaptureState
from tests.fixtures.frames import make_standard_frame


class FailingTxDriver(MockDriver):
    def send_frame(self, frame) -> None:
        raise OSError("adapter disconnected")


def test_mock_send_frame_requires_connection() -> None:
    driver = MockDriver(())

    with pytest.raises(CanConnectionError):
        driver.send_frame(make_standard_frame(0x123, b"\x01"))


def test_capture_session_maps_driver_failure_to_domain_error() -> None:
    driver = FailingTxDriver(())
    driver.connect()
    session = CaptureSession("tx", 1.0, driver, CanUsbConfig())
    session._state = CaptureState.RUNNING

    with pytest.raises(CanAdapterError) as exc_info:
        session.send_frame(make_standard_frame(0x123, b"\x01"))

    assert not isinstance(exc_info.value, OSError)
    assert session._tx == 0
