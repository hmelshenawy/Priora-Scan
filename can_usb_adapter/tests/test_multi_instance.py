import uuid

import can

from prioracan.config import CanUsbConfig
from prioracan.drivers.gs_usb import GsUsbDriver
from prioracan.drivers.mock import MockDriver
from prioracan.status import DriverState
from tests.fixtures.frames import DETERMINISTIC_FRAMES


def test_two_mock_drivers_are_independent() -> None:
    first_frames = DETERMINISTIC_FRAMES[:2]
    second_frames = DETERMINISTIC_FRAMES[2:4]
    first = MockDriver(first_frames)
    second = MockDriver(second_frames)
    first.connect()
    second.connect()
    assert first.receive() == first_frames[0]
    assert second.receive() == second_frames[0]
    first.disconnect()
    assert second.is_connected()
    assert second.receive() == second_frames[1]


def test_mock_and_gs_usb_virtual_driver_are_independent() -> None:
    channel = f"prioracan-{uuid.uuid4()}"
    config = CanUsbConfig(interface="virtual", channel=channel)
    mock = MockDriver(DETERMINISTIC_FRAMES[:1])
    gs_usb = GsUsbDriver(config)
    sender = can.Bus(interface="virtual", channel=channel)
    mock.connect()
    gs_usb.connect()
    try:
        sender.send(can.Message(arbitration_id=0x321, data=[0x44], is_extended_id=False))
        assert mock.receive() == DETERMINISTIC_FRAMES[0]
        assert gs_usb.receive(0.2).arbitration_id == 0x321
        mock.disconnect()
        assert gs_usb.get_status().state == DriverState.LISTENING
    finally:
        gs_usb.disconnect()
        sender.shutdown()
