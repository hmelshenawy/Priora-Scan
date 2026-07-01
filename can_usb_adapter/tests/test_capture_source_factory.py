import logging

import pytest

from prioracan.capture_sources.asc_loader import parse_asc_lines
from prioracan.capture_sources.factory import CaptureSourceFactory
from prioracan.configuration.source import load_capture_source_config
from prioracan.drivers.gs_usb import GsUsbDriver
from prioracan.drivers.mock import MockDriver
from prioracan.errors import CanConfigurationError, CanReceiveTimeout


def test_mock_source_selects_mock_driver(tmp_path) -> None:
    trace = tmp_path / "tiny.asc"
    trace.write_text(_tiny_asc(), encoding="utf-8")
    config = load_capture_source_config({"CAN_SOURCE": "MOCK", "CAN_MOCK_TRACE": str(trace)})

    driver = CaptureSourceFactory(config).create_driver()

    assert isinstance(driver, MockDriver)
    driver.connect()
    assert driver.receive().arbitration_id == 0x100


def test_real_source_selects_gs_usb_driver() -> None:
    config = load_capture_source_config(
        {
            "CAN_SOURCE": "REAL",
            "CAN_INTERFACE": "gs_usb",
            "CAN_CHANNEL": "0",
            "CAN_BITRATE": "500000",
        }
    )

    driver = CaptureSourceFactory(config).create_driver()

    assert isinstance(driver, GsUsbDriver)


def test_missing_asc_file_returns_empty_mock_driver(tmp_path, caplog) -> None:
    missing = tmp_path / "missing.asc"
    config = load_capture_source_config({"CAN_SOURCE": "MOCK", "CAN_MOCK_TRACE": str(missing)})

    with caplog.at_level(logging.WARNING):
        driver = CaptureSourceFactory(config).create_driver()

    assert isinstance(driver, MockDriver)
    assert "CAN_MOCK_TRACE does not exist" in caplog.text
    driver.connect()
    with pytest.raises(CanReceiveTimeout):
        driver.receive()


def test_invalid_source_value_is_rejected() -> None:
    with pytest.raises(CanConfigurationError):
        load_capture_source_config({"CAN_SOURCE": "USB"})


def test_asc_loader_parses_tiny_fixture() -> None:
    frames = parse_asc_lines(_tiny_asc().splitlines())

    assert len(frames) == 2
    assert frames[0].timestamp == 0.0
    assert frames[0].channel == 1
    assert frames[0].arbitration_id == 0x100
    assert frames[0].data == b"\x11\x22"
    assert frames[1].arbitration_id == 0x1ABCDE
    assert frames[1].is_extended_id is True


def test_env_file_values_are_used(tmp_path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            (
                "CAN_SOURCE=REAL",
                "CAN_INTERFACE=gs_usb",
                "CAN_CHANNEL=1",
                "CAN_BITRATE=250000",
            )
        ),
        encoding="utf-8",
    )

    config = load_capture_source_config({}, env_file=env_file)

    assert config.source == "REAL"
    assert config.channel == 1
    assert config.bitrate == 250000


def _tiny_asc() -> str:
    return "\n".join(
        (
            "date Mon Jun 29 09:41:20.987 pm 2026",
            "base hex  timestamps absolute",
            "   0.000000 1  100             Rx   d 2 11 22   Length = 0",
            "   0.010000 1  1abcdex         Rx   d 1 33      Length = 0",
            "   0.020000 1  200             Tx   d 1 44      Length = 0",
        )
    )
