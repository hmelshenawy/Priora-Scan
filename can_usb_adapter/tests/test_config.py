from dataclasses import FrozenInstanceError

import pytest

from prioracan.config import CanUsbConfig
from prioracan.errors import CanConfigurationError


def test_config_defaults() -> None:
    config = CanUsbConfig()
    assert config.interface == "gs_usb"
    assert config.channel == 0
    assert config.bitrate == 500000
    assert config.receive_timeout_seconds == 1.0
    assert config.log_directory is None
    assert config.jsonl_enabled is False
    assert config.asc_enabled is False


@pytest.mark.parametrize(
    "kwargs",
    [{"bitrate": 0}, {"receive_timeout_seconds": -0.1}, {"interface": ""}],
)
def test_invalid_config_rejected(kwargs: dict[str, object]) -> None:
    with pytest.raises(CanConfigurationError):
        CanUsbConfig(**kwargs)


def test_config_is_frozen() -> None:
    config = CanUsbConfig()
    with pytest.raises(FrozenInstanceError):
        config.bitrate = 250000
