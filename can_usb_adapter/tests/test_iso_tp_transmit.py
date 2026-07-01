import pytest

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.errors import CanAdapterError
from prioracan.iso_tp import IsoTpBufferOverflowError, IsoTpConfig, IsoTpTransport
from prioracan.session import CaptureSession, CaptureState
from tests.fixtures.frames import make_standard_frame


def running_transport():
    driver = MockDriver(())
    driver.connect()
    session = CaptureSession("tx", 1.0, driver, CanUsbConfig())
    session._state = CaptureState.RUNNING
    config = IsoTpConfig(rx_arbitration_id=0x456, tx_arbitration_id=0x123)
    transport = IsoTpTransport(session, config=config)
    transport.start()
    return transport, driver


def test_single_frame_selection_still_works() -> None:
    transport, driver = running_transport()

    transport.send_payload(b"abcdefg")

    assert driver.sent_frames == [driver.sent_frames[0]]
    assert driver.sent_frames[0].data == b"\x07abcdefg"


def test_multi_frame_emits_first_frame_then_consecutive_frames_after_cts() -> None:
    transport, driver = running_transport()
    payload = bytes(range(20))

    transport.send_payload(payload)
    assert driver.sent_frames[0].data == b"\x10\x14" + payload[:6]
    assert transport.is_busy is True

    transport.process_frame(make_standard_frame(0x456, b"\x30\x00\x00"))

    assert [frame.data for frame in driver.sent_frames[1:]] == [
        b"\x21" + payload[6:13],
        b"\x22" + payload[13:20],
    ]
    assert transport.is_busy is False


def test_sequence_numbers_wrap_for_large_payload() -> None:
    transport, driver = running_transport()
    payload = bytes(range(130))

    transport.send_payload(payload)
    transport.process_frame(make_standard_frame(0x456, b"\x30\x00\x00"))

    sequences = [frame.data[0] & 0x0F for frame in driver.sent_frames[1:]]
    assert sequences[:17] == [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0, 1]


def test_block_size_pauses_until_next_cts() -> None:
    transport, driver = running_transport()
    payload = bytes(range(30))

    transport.send_payload(payload)
    transport.process_frame(make_standard_frame(0x456, b"\x30\x02\x00"))

    assert len(driver.sent_frames) == 3
    assert transport.is_busy is True

    transport.process_frame(make_standard_frame(0x456, b"\x30\x00\x00"))
    assert transport.is_busy is False


def test_payload_boundaries_and_busy_guard() -> None:
    transport, _driver = running_transport()
    with pytest.raises(IsoTpBufferOverflowError):
        transport.send_payload(bytes(4096))
    transport.send_payload(bytes(range(20)))
    with pytest.raises(CanAdapterError):
        transport.send_payload(b"\x01")
