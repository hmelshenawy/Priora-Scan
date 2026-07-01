import time

import pytest

from prioracan.config import CanUsbConfig
from prioracan.drivers.mock import MockDriver
from prioracan.errors import CanAdapterError
from prioracan.iso_tp import IsoTpConfig, IsoTpTransport
from prioracan.iso_tp.errors import IsoTpTimeoutError
from prioracan.session import CaptureSession, CaptureState
from tests.fixtures.frames import make_standard_frame


def running_transport(*, on_payload=None):
    driver = MockDriver(())
    driver.connect()
    session = CaptureSession("timeout", 1.0, driver, CanUsbConfig())
    session._state = CaptureState.RUNNING
    config = IsoTpConfig(
        rx_arbitration_id=0x456,
        tx_arbitration_id=0x123,
        wait_for_flow_control_seconds=0.01,
        wait_for_consecutive_frame_seconds=0.01,
    )
    transport = IsoTpTransport(session, config=config, on_payload=on_payload)
    transport.start()
    return transport, driver, session


def test_wait_for_flow_control_timeout_cleans_transmit_state() -> None:
    transport, _driver, _session = running_transport()
    transport.send_payload(bytes(range(20)))
    time.sleep(0.02)

    with pytest.raises(IsoTpTimeoutError):
        transport.check_timeouts()

    assert transport.is_busy is False


def test_wait_for_consecutive_frame_timeout_cleans_receive_state() -> None:
    delivered = []
    transport, _driver, _session = running_transport(on_payload=delivered.append)
    transport.process_frame(make_standard_frame(0x456, b"\x10\x0aabcdef"))
    time.sleep(0.02)

    with pytest.raises(IsoTpTimeoutError):
        transport.check_timeouts()

    assert transport.is_busy is False
    assert delivered == []


def test_reuse_after_timeout_abort_succeeds() -> None:
    transport, driver, _session = running_transport()
    transport.send_payload(bytes(range(20)))
    time.sleep(0.02)
    with pytest.raises(IsoTpTimeoutError):
        transport.check_timeouts()

    transport.send_payload(b"\x01")

    assert driver.sent_frames[-1].data == b"\x01\x01"


def test_capture_session_stop_mid_transfer_surfaces_domain_error() -> None:
    transport, _driver, session = running_transport()
    transport.process_frame(make_standard_frame(0x456, b"\x10\x0aabcdef"))
    session._state = CaptureState.STOPPED

    with pytest.raises(CanAdapterError):
        transport.process_frame(make_standard_frame(0x456, b"\x21ghij"))

    assert transport.is_busy is False


def test_many_alternating_transfers_do_not_leave_busy_state() -> None:
    transport, _driver, _session = running_transport()
    for _index in range(5):
        transport.send_payload(b"\x01")
        assert transport.is_busy is False
        transport.send_payload(bytes(range(20)))
        time.sleep(0.02)
        with pytest.raises(IsoTpTimeoutError):
            transport.check_timeouts()
        assert transport.is_busy is False
