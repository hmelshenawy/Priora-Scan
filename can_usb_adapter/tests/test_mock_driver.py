import threading

import pytest

from prioracan.capabilities import MOCK_CAPABILITIES
from prioracan.drivers.base import assert_conforms
from prioracan.drivers.mock import MockDriver
from prioracan.errors import CanReceiveTimeout
from prioracan.status import DriverState


def test_mock_replays_frames_in_order(deterministic_frames) -> None:
    driver = MockDriver(deterministic_frames)
    assert_conforms(driver)
    driver.connect()
    assert [driver.receive() for _ in deterministic_frames] == deterministic_frames
    with pytest.raises(CanReceiveTimeout):
        driver.receive(0)


def test_mock_status_capabilities_and_disconnect(deterministic_frames) -> None:
    driver = MockDriver(deterministic_frames)
    assert driver.get_status().state == DriverState.DISCONNECTED
    driver.connect()
    assert driver.get_status().state == DriverState.CONNECTED
    driver.receive()
    assert driver.get_status().state == DriverState.LISTENING
    assert driver.get_status().received_frame_count == 1
    assert driver.get_capabilities() == MOCK_CAPABILITIES
    driver.disconnect()
    driver.disconnect()
    assert driver.get_status().state == DriverState.DISCONNECTED


def test_mock_iter_frames_stops(deterministic_frames) -> None:
    stop_event = threading.Event()
    driver = MockDriver(deterministic_frames)
    driver.connect()
    iterator = driver.iter_frames(stop_event)
    assert next(iterator) == deterministic_frames[0]
    stop_event.set()
    with pytest.raises(StopIteration):
        next(iterator)


def test_two_mock_instances_are_independent(deterministic_frames) -> None:
    first = MockDriver(deterministic_frames[:1])
    second = MockDriver(deterministic_frames[1:2])
    first.connect()
    second.connect()
    assert first.receive() == deterministic_frames[0]
    assert second.receive() == deterministic_frames[1]
