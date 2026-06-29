from dataclasses import FrozenInstanceError, fields

import pytest

from prioracan.capabilities import (
    GS_USB_CAPABILITIES,
    MOCK_CAPABILITIES,
    DriverCapabilities,
)


def test_capability_fields_are_exact() -> None:
    assert [field.name for field in fields(DriverCapabilities)] == [
        "receive",
        "transmit",
        "can_fd",
        "hardware_filters",
        "software_filters",
        "replay",
        "timestamps",
    ]


def test_named_capabilities_values() -> None:
    assert GS_USB_CAPABILITIES == DriverCapabilities(True, False, False, False, False, False, True)
    assert MOCK_CAPABILITIES == DriverCapabilities(True, False, False, False, False, True, True)


def test_capabilities_frozen() -> None:
    caps = DriverCapabilities(True, False, False, False, False, False, True)
    with pytest.raises(FrozenInstanceError):
        caps.receive = False
