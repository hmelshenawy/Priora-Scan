import inspect
import threading
from collections.abc import Iterator

import pytest

from prioracan.capabilities import DriverCapabilities
from prioracan.drivers.base import CanDriver, assert_conforms
from prioracan.frame import CanFrame, Direction
from prioracan.status import DriverState, DriverStatus


class ConformingDriver:
    def connect(self) -> None:
        pass

    def disconnect(self) -> None:
        pass

    def is_connected(self) -> bool:
        return True

    def receive(self, timeout_seconds: float | None = None) -> CanFrame:
        return CanFrame(0.0, 0, Direction.RX, 1, False, False, False, 0, b"")

    def iter_frames(
        self, stop_event: threading.Event | None = None
    ) -> Iterator[CanFrame]:
        if False:
            yield self.receive()

    def get_status(self) -> DriverStatus:
        return DriverStatus(DriverState.CONNECTED)

    def get_capabilities(self) -> DriverCapabilities:
        return DriverCapabilities(True, False, False, False, False, False, True)


class ForbiddenTransmitDriver(ConformingDriver):
    def transmit(self) -> None:
        pass


def test_conforming_stub_passes() -> None:
    assert_conforms(ConformingDriver())


@pytest.mark.parametrize("name", ["transmit", "send", "write"])
def test_forbidden_operations_fail(name: str) -> None:
    driver = ConformingDriver()
    setattr(driver, name, lambda: None)
    with pytest.raises(TypeError):
        assert_conforms(driver)


def test_protocol_declares_exact_methods() -> None:
    methods = {
        name
        for name, value in CanDriver.__dict__.items()
        if inspect.isfunction(value) and not name.startswith("_")
    }
    assert methods == {
        "connect",
        "disconnect",
        "is_connected",
        "receive",
        "iter_frames",
        "get_status",
        "get_capabilities",
    }
