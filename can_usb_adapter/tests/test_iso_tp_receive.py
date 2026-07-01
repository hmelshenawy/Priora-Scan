import pytest

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.errors import CanAdapterError
from prioracan.iso_tp import IsoTpConfig, IsoTpTransport
from prioracan.iso_tp.errors import (
    IsoTpBufferOverflowError,
    IsoTpFrameFormatError,
    IsoTpSequenceError,
)
from prioracan.session import CaptureSession, CaptureState
from tests.conftest import StubFrameLogger
from tests.fixtures.frames import make_standard_frame


def running_transport(*, on_payload=None, max_payload_bytes=4095, block_size=0, st_min_ms=0):
    driver = MockDriver(())
    driver.connect()
    session = CaptureSession("rx", 1.0, driver, CanUsbConfig())
    session._state = CaptureState.RUNNING
    config = IsoTpConfig(
        rx_arbitration_id=0x456,
        tx_arbitration_id=0x123,
        block_size=block_size,
        st_min_ms=st_min_ms,
        max_payload_bytes=max_payload_bytes,
    )
    transport = IsoTpTransport(session, config=config, on_payload=on_payload)
    transport.start()
    return transport, driver, session


def test_first_frame_emits_cts_with_configured_parameters() -> None:
    transport, driver, _session = running_transport(block_size=4, st_min_ms=10)

    transport.process_frame(make_standard_frame(0x456, b"\x10\x08abcdef"))

    assert driver.sent_frames[-1].arbitration_id == 0x123
    assert driver.sent_frames[-1].data == b"\x30\x04\x0a"
    assert transport.is_busy is True


def test_reassembles_multi_frame_payload_and_cleans_state() -> None:
    delivered = []
    transport, driver, _session = running_transport(on_payload=delivered.append)

    transport.process_frame(make_standard_frame(0x456, b"\x10\x0aabcdef"))
    transport.process_frame(make_standard_frame(0x456, b"\x21ghij"))

    assert delivered == [b"abcdefghij"]
    assert len(driver.sent_frames) == 1
    assert transport.is_busy is False


def test_sequence_wrap_past_sixteen_frames() -> None:
    payload = bytes(range(120))
    delivered = []
    transport, _driver, _session = running_transport(on_payload=delivered.append)
    transport.process_frame(make_standard_frame(0x456, b"\x10\x78" + payload[:6]))
    offset = 6
    sequence = 1
    while offset < len(payload):
        chunk = payload[offset : offset + 7]
        transport.process_frame(make_standard_frame(0x456, bytes([0x20 | sequence]) + chunk))
        offset += len(chunk)
        sequence = (sequence + 1) % 16

    assert delivered == [payload]
    assert transport.is_busy is False


@pytest.mark.parametrize("sequence", [1, 3])
def test_duplicate_or_out_of_order_cf_aborts(sequence: int) -> None:
    transport, _driver, _session = running_transport()
    transport.process_frame(make_standard_frame(0x456, b"\x10\x0aabcdef"))
    if sequence == 1:
        transport.process_frame(make_standard_frame(0x456, b"\x21ghi"))
    with pytest.raises(IsoTpSequenceError):
        transport.process_frame(make_standard_frame(0x456, bytes([0x20 | sequence]) + b"xyz"))
    assert transport.is_busy is False


def test_cf_when_idle_raises_format_error() -> None:
    transport, _driver, _session = running_transport()

    with pytest.raises(IsoTpFrameFormatError):
        transport.process_frame(make_standard_frame(0x456, b"\x21abc"))


def test_first_frame_limits_and_overrun_cleanup() -> None:
    transport, _driver, _session = running_transport(max_payload_bytes=8)
    with pytest.raises(IsoTpBufferOverflowError):
        transport.process_frame(make_standard_frame(0x456, b"\x10\x09abcdef"))
    with pytest.raises(IsoTpFrameFormatError):
        transport.process_frame(make_standard_frame(0x456, b"\x10\x00abcdef"))
    transport.process_frame(make_standard_frame(0x456, b"\x10\x08abcdef"))
    with pytest.raises(IsoTpFrameFormatError):
        transport.process_frame(make_standard_frame(0x456, b"\x21xyz"))
    assert transport.is_busy is False


def test_first_frame_mid_transfer_aborts_without_payload() -> None:
    delivered = []
    transport, _driver, _session = running_transport(on_payload=delivered.append)
    transport.process_frame(make_standard_frame(0x456, b"\x10\x0aabcdef"))

    with pytest.raises(IsoTpFrameFormatError):
        transport.process_frame(make_standard_frame(0x456, b"\x10\x08abcdef"))

    assert delivered == []
    assert transport.is_busy is False


def test_unrelated_id_is_ignored_during_receive() -> None:
    delivered = []
    transport, _driver, _session = running_transport(on_payload=delivered.append)
    transport.process_frame(make_standard_frame(0x777, b"\x10\x08abcdef"))

    assert delivered == []
    assert transport.is_busy is False


def test_listener_exception_does_not_break_logger_dispatch() -> None:
    logger = StubFrameLogger()
    session = CaptureSession("rx", 1.0, MockDriver(()), CanUsbConfig(), loggers=(logger,))
    session.add_frame_listener(lambda frame: (_ for _ in ()).throw(CanAdapterError("boom")))
    frame = make_standard_frame(0x456, b"\x00")

    session._dispatch(frame)

    assert logger.frames == [frame]
