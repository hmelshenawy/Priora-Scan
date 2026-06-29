import inspect
import json

import pytest

from prioracan.drivers.mock import MockDriver
from prioracan.errors import CanLoggingError
from prioracan.logging.jsonl import JsonlLogger
from prioracan.services.connection import ConnectionService
from prioracan.status import DriverState
from tests.fixtures.frames import DETERMINISTIC_FRAMES


class FailingLogger:
    def open(self) -> None:
        pass

    def write_frame(self, frame) -> None:
        raise CanLoggingError("write failed")

    def close(self) -> None:
        pass


def test_connection_service_receives_and_logs_once(tmp_path) -> None:
    path = tmp_path / "capture.jsonl"
    driver = MockDriver(DETERMINISTIC_FRAMES[:1])
    service = ConnectionService(driver, [JsonlLogger(path)])
    service.connect()
    frame = service.receive_once()
    service.disconnect()
    assert frame == DETERMINISTIC_FRAMES[0]
    record = json.loads(path.read_text())
    assert record["arbitration_id"] == frame.arbitration_id
    assert service.get_status().state == DriverState.DISCONNECTED


def test_connection_service_status_and_disconnect_idempotent(tmp_path) -> None:
    service = ConnectionService(MockDriver(DETERMINISTIC_FRAMES), [JsonlLogger(tmp_path / "c.jsonl")])
    service.connect()
    assert service.get_status().state == DriverState.CONNECTED
    service.disconnect()
    service.disconnect()
    assert service.get_status().state == DriverState.DISCONNECTED


def test_connection_service_surfaces_logger_error() -> None:
    service = ConnectionService(MockDriver(DETERMINISTIC_FRAMES), [FailingLogger()])
    service.connect()
    with pytest.raises(CanLoggingError):
        service.receive_once()
    service.disconnect()


def test_connection_service_exposes_only_thin_methods() -> None:
    methods = {
        name
        for name, value in ConnectionService.__dict__.items()
        if inspect.isfunction(value) and not name.startswith("_")
    }
    assert methods == {"connect", "receive_once", "get_status", "disconnect"}
    assert not methods & {"run", "stream", "loop", "iter_frames"}
