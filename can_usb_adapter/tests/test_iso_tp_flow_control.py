import pytest

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.iso_tp import IsoTpConfig, IsoTpTransport
from prioracan.iso_tp.errors import IsoTpFlowControlError, IsoTpFrameFormatError
from prioracan.session import CaptureSession, CaptureState
from tests.fixtures.frames import make_standard_frame


def running_transport():
    driver = MockDriver(())
    driver.connect()
    session = CaptureSession("fc", 1.0, driver, CanUsbConfig())
    session._state = CaptureState.RUNNING
    config = IsoTpConfig(rx_arbitration_id=0x456, tx_arbitration_id=0x123)
    transport = IsoTpTransport(session, config=config)
    transport.start()
    return transport, driver


def test_cts_resumes_transmit_and_extracts_bs_stmin() -> None:
    transport, driver = running_transport()
    transport.send_payload(bytes(range(20)))

    transport.process_frame(make_standard_frame(0x456, b"\x30\x00\x00"))

    assert [frame.data[0] >> 4 for frame in driver.sent_frames] == [1, 2, 2]
    assert transport.is_busy is False


@pytest.mark.parametrize("status", [0x31, 0x32])
def test_wait_and_overflow_abort_transmit(status: int) -> None:
    transport, _driver = running_transport()
    transport.send_payload(bytes(range(20)))

    with pytest.raises(IsoTpFlowControlError):
        transport.process_frame(make_standard_frame(0x456, bytes([status, 0, 0])))

    assert transport.is_busy is False


@pytest.mark.parametrize("data", [b"\x33\x00\x00", b"\x30\x00\x80", b"\x30\x00\xff"])
def test_malformed_flow_control_aborts_transmit(data: bytes) -> None:
    transport, _driver = running_transport()
    transport.send_payload(bytes(range(20)))

    with pytest.raises(IsoTpFrameFormatError):
        transport.process_frame(make_standard_frame(0x456, data))

    assert transport.is_busy is False


def test_receive_side_emits_only_cts() -> None:
    transport, driver = running_transport()

    transport.process_frame(make_standard_frame(0x456, b"\x10\x08abcdef"))

    assert driver.sent_frames[-1].data[0] == 0x30
