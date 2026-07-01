import json
import threading
import time
import uuid

import can
import pytest

from prioracan.config import CanUsbConfig
from prioracan.drivers.gs_usb import GsUsbDriver
from prioracan.errors import CanConnectionError
from prioracan.logging import JsonlLogger
from prioracan.session import CaptureSession, CaptureState


def virtual_config() -> CanUsbConfig:
    return CanUsbConfig(
        interface="virtual",
        channel=f"prioracan-capture-{uuid.uuid4()}",
        receive_timeout_seconds=0.01,
    )


def test_virtual_bus_capture_counts_and_writes_jsonl(tmp_path) -> None:
    config = virtual_config()
    driver = GsUsbDriver(config)
    path = tmp_path / "capture.jsonl"
    session = CaptureSession(
        "gs", 1.0, driver, config, loggers=(JsonlLogger(path),), stop_timeout_seconds=0.5
    )
    result = _start_in_thread(session)
    sender = can.Bus(interface="virtual", channel=config.channel)
    try:
        _wait_until(lambda: session.is_running)
        sender.send(can.Message(arbitration_id=0x100, data=[0x11], is_extended_id=False))
        sender.send(can.Message(arbitration_id=0x200, data=[0x22, 0x33], is_extended_id=False))
        _wait_until(lambda: driver.get_status().received_frame_count >= 2)
        stats = session.stop()
        result["thread"].join(timeout=1.0)
    finally:
        sender.shutdown()

    assert result.get("error") is None
    assert stats.total_frames == 2
    records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    assert [record["arbitration_id"] for record in records] == [0x100, 0x200]


def test_virtual_bus_idle_shutdown_is_bounded(tmp_path) -> None:
    config = virtual_config()
    driver = GsUsbDriver(config)
    session = CaptureSession(
        "gs",
        1.0,
        driver,
        config,
        loggers=(JsonlLogger(tmp_path / "idle.jsonl"),),
        stop_timeout_seconds=0.5,
    )
    result = _start_in_thread(session)

    _wait_until(lambda: session.is_running)
    started = time.monotonic()
    session.stop()
    result["thread"].join(timeout=1.0)

    assert result.get("error") is None
    assert time.monotonic() - started <= session.stop_timeout_seconds + 0.1
    assert session._state is CaptureState.STOPPED


def test_virtual_bus_disconnect_mid_capture_surfaces_domain_error(tmp_path) -> None:
    config = virtual_config()
    driver = GsUsbDriver(config)
    session = CaptureSession(
        "gs", 1.0, driver, config, loggers=(JsonlLogger(tmp_path / "disconnect.jsonl"),)
    )
    result = _start_in_thread(session)

    _wait_until(lambda: session.is_running)
    driver.disconnect()
    result["thread"].join(timeout=1.0)

    assert isinstance(result.get("error"), CanConnectionError)
    assert session._state is CaptureState.STOPPED
    assert driver.is_connected() is False


def _start_in_thread(session: CaptureSession) -> dict[str, object]:
    result = {}

    def target() -> None:
        try:
            result["stats"] = session.start()
        except Exception as exc:  # pragma: no cover - asserted by caller
            result["error"] = exc

    result["thread"] = threading.Thread(target=target)
    result["thread"].start()
    return result


def _wait_until(predicate, timeout: float = 1.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.001)
    pytest.fail("condition was not reached before timeout")
