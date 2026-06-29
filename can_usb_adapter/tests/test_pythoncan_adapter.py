import uuid

import can
import pytest

from prioracan.config import CanUsbConfig
from prioracan.drivers.adapters.python_can_adapter import PythonCanAdapter
from prioracan.errors import (
    CanAdapterError,
    CanConfigurationError,
    CanConnectionError,
    CanDeviceNotFoundError,
    CanPermissionError,
)


def virtual_config() -> CanUsbConfig:
    return CanUsbConfig(interface="virtual", channel=f"prioracan-{uuid.uuid4()}")


def test_virtual_open_recv_close() -> None:
    config = virtual_config()
    adapter = PythonCanAdapter()
    sender = can.Bus(interface="virtual", channel=config.channel)
    adapter.open(config)
    try:
        sender.send(can.Message(arbitration_id=0x123, data=[1, 2], is_extended_id=False))
        message = adapter.recv(0.2)
        assert message is not None
        assert message.arbitration_id == 0x123
        assert bytes(message.data) == b"\x01\x02"
    finally:
        adapter.close()
        sender.shutdown()


def test_virtual_recv_empty_returns_none_and_close_idempotent() -> None:
    adapter = PythonCanAdapter()
    adapter.open(virtual_config())
    assert adapter.recv(0) is None
    adapter.close()
    adapter.close()
    assert adapter.is_open() is False


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("permission denied", CanPermissionError),
        ("no device found", CanDeviceNotFoundError),
        ("unknown interface", CanConfigurationError),
        ("something unexpected", CanAdapterError),
    ],
)
def test_open_exception_mapping(monkeypatch, message: str, expected: type[Exception]) -> None:
    def fail_bus(**kwargs):
        raise RuntimeError(message)

    monkeypatch.setattr(can, "Bus", fail_bus)
    with pytest.raises(expected):
        PythonCanAdapter().open(virtual_config())


def test_recv_disconnected_raises_connection_error() -> None:
    with pytest.raises(CanConnectionError):
        PythonCanAdapter().recv(0)
