import can
import inspect
import pytest

from prioracan.drivers.gs_usb import GsUsbDriver
from prioracan.drivers.base import CanDriver
from prioracan.errors import CanConnectionError
from prioracan.config import CanUsbConfig
from prioracan.session import CaptureSession, CaptureState
from tests.fixtures.frames import make_extended_frame, make_standard_frame


def test_gs_usb_send_frame_transmits_on_virtual_bus(virtual_bus_config) -> None:
    driver = GsUsbDriver(virtual_bus_config)
    receiver = can.Bus(
        interface="virtual",
        channel=virtual_bus_config.channel,
        receive_own_messages=True,
    )
    frame = make_standard_frame(0x321, b"\x01\x02\x03")
    try:
        driver.connect()
        driver.send_frame(frame)
        message = receiver.recv(timeout=0.5)
    finally:
        driver.disconnect()
        receiver.shutdown()

    assert message is not None
    assert message.arbitration_id == frame.arbitration_id
    assert bytes(message.data) == frame.data
    assert message.is_extended_id is False


def test_gs_usb_send_frame_preserves_extended_id(virtual_bus_config) -> None:
    driver = GsUsbDriver(virtual_bus_config)
    receiver = can.Bus(
        interface="virtual",
        channel=virtual_bus_config.channel,
        receive_own_messages=True,
    )
    frame = make_extended_frame(0x1ABCDE, b"\x7e")
    try:
        driver.connect()
        driver.send_frame(frame)
        message = receiver.recv(timeout=0.5)
    finally:
        driver.disconnect()
        receiver.shutdown()

    assert message is not None
    assert message.arbitration_id == frame.arbitration_id
    assert message.is_extended_id is True


def test_gs_usb_send_frame_requires_connection(virtual_bus_config) -> None:
    driver = GsUsbDriver(virtual_bus_config)

    with pytest.raises(CanConnectionError):
        driver.send_frame(make_standard_frame(0x321, b"\x01"))


def test_capture_session_send_frame_with_gs_usb_virtual_bus(virtual_bus_config) -> None:
    driver = GsUsbDriver(virtual_bus_config)
    session = CaptureSession("tx", 1.0, driver, CanUsbConfig())
    receiver = can.Bus(
        interface="virtual",
        channel=virtual_bus_config.channel,
        receive_own_messages=True,
    )
    frame = make_standard_frame(0x456, b"\x0a\x0b")
    try:
        driver.connect()
        session._state = CaptureState.RUNNING
        session.send_frame(frame)
        message = receiver.recv(timeout=0.5)
    finally:
        driver.disconnect()
        receiver.shutdown()

    assert message is not None
    assert bytes(message.data) == frame.data
    assert session._tx == 1


def test_can_driver_protocol_does_not_declare_send_frame() -> None:
    methods = {
        name
        for name, value in CanDriver.__dict__.items()
        if inspect.isfunction(value) and not name.startswith("_")
    }
    assert "send_frame" not in methods
    assert len(methods) == 7
