import threading
import uuid

import can
import pytest

from prioracan.capabilities import GS_USB_CAPABILITIES
from prioracan.config import CanUsbConfig
from prioracan.drivers.base import assert_conforms
from prioracan.drivers.gs_usb import GsUsbDriver
from prioracan.errors import CanReceiveTimeout
from prioracan.frame import Direction
from prioracan.status import DriverState


def virtual_config() -> CanUsbConfig:
    return CanUsbConfig(interface="virtual", channel=f"prioracan-{uuid.uuid4()}")


def test_gs_usb_driver_receives_virtual_frame() -> None:
    config = virtual_config()
    driver = GsUsbDriver(config)
    sender = can.Bus(interface="virtual", channel=config.channel)
    driver.connect()
    try:
        sender.send(can.Message(arbitration_id=0x456, data=[0xAA], is_extended_id=False))
        frame = driver.receive(0.2)
        assert frame.direction == Direction.RX
        assert frame.arbitration_id == 0x456
        assert frame.data == b"\xAA"
        assert frame.bitrate == config.bitrate
        assert driver.get_status().state == DriverState.LISTENING
    finally:
        driver.disconnect()
        sender.shutdown()


def test_gs_usb_driver_timeout_status_and_capabilities() -> None:
    driver = GsUsbDriver(virtual_config())
    assert_conforms(driver)
    assert driver.get_status().state == DriverState.DISCONNECTED
    driver.connect()
    try:
        assert driver.get_status().state == DriverState.CONNECTED
        assert driver.get_capabilities() == GS_USB_CAPABILITIES
        with pytest.raises(CanReceiveTimeout):
            driver.receive(0)
    finally:
        driver.disconnect()
        driver.disconnect()
    assert driver.get_status().state == DriverState.DISCONNECTED


def test_iter_frames_stops_on_stop_event() -> None:
    config = virtual_config()
    driver = GsUsbDriver(config)
    sender = can.Bus(interface="virtual", channel=config.channel)
    stop_event = threading.Event()
    driver.connect()
    try:
        sender.send(can.Message(arbitration_id=0x100, data=[], is_extended_id=False))
        frames = driver.iter_frames(stop_event)
        frame = next(frames)
        stop_event.set()
        assert frame.arbitration_id == 0x100
        with pytest.raises(StopIteration):
            next(frames)
    finally:
        driver.disconnect()
        sender.shutdown()
