import pytest

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.errors import CanAdapterError
from prioracan.iso_tp import IsoTpBufferOverflowError, IsoTpConfig, IsoTpTransport
from prioracan.iso_tp.errors import IsoTpFrameFormatError
from prioracan.session import CaptureSession, CaptureState
from tests.fixtures.frames import make_standard_frame


def running_transport(*, on_payload=None):
    driver = MockDriver(())
    driver.connect()
    session = CaptureSession("sf", 1.0, driver, CanUsbConfig())
    session._state = CaptureState.RUNNING
    config = IsoTpConfig(rx_arbitration_id=0x456, tx_arbitration_id=0x123)
    transport = IsoTpTransport(session, config=config, on_payload=on_payload)
    transport.start()
    return transport, driver


@pytest.mark.parametrize("payload", [b"", b"\x01", b"abcdefg"])
def test_single_frame_send_emits_one_can_frame(payload: bytes) -> None:
    transport, driver = running_transport()

    transport.send_payload(payload)

    assert len(driver.sent_frames) == 1
    frame = driver.sent_frames[0]
    assert frame.arbitration_id == 0x123
    assert frame.direction.value == "RX"
    assert frame.data == bytes([len(payload)]) + payload
    assert transport.is_busy is False


def test_payload_over_transport_limit_is_rejected() -> None:
    transport, _driver = running_transport()

    with pytest.raises(IsoTpBufferOverflowError):
        transport.send_payload(bytes(4096))

    assert transport.is_busy is False


def test_valid_incoming_single_frame_delivers_payload() -> None:
    delivered = []
    transport, _driver = running_transport(on_payload=delivered.append)
    frame = make_standard_frame(0x456, b"\x03abc")

    transport.process_frame(frame)

    assert delivered == [b"abc"]
    assert transport.is_busy is False


def test_unrelated_frame_is_ignored() -> None:
    delivered = []
    transport, _driver = running_transport(on_payload=delivered.append)

    transport.process_frame(make_standard_frame(0x777, b"\x03abc"))

    assert delivered == []


@pytest.mark.parametrize("data", [b"\x04abc", b"\x08abcdefgh"])
def test_malformed_single_frame_raises_and_delivers_nothing(data: bytes) -> None:
    delivered = []
    transport, _driver = running_transport(on_payload=delivered.append)

    with pytest.raises(IsoTpFrameFormatError):
        transport.process_frame(make_standard_frame(0x456, data[:8]))

    assert delivered == []
    assert transport.is_busy is False


def test_send_while_busy_raises_domain_error() -> None:
    transport, _driver = running_transport()
    transport._transfer_state = object()

    with pytest.raises(CanAdapterError):
        transport.send_payload(b"\x01")


def test_disposed_transport_rejects_operations() -> None:
    transport, _driver = running_transport()
    transport.dispose()

    with pytest.raises(CanAdapterError):
        transport.send_payload(b"\x01")
    with pytest.raises(CanAdapterError):
        transport.process_frame(make_standard_frame(0x456, b"\x00"))
