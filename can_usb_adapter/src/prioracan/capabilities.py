from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class DriverCapabilities:
    receive: bool
    transmit: bool
    can_fd: bool
    hardware_filters: bool
    software_filters: bool
    replay: bool
    timestamps: bool


GS_USB_CAPABILITIES = DriverCapabilities(
    receive=True,
    transmit=False,
    can_fd=False,
    hardware_filters=False,
    software_filters=False,
    replay=False,
    timestamps=True,
)

MOCK_CAPABILITIES = DriverCapabilities(
    receive=True,
    transmit=False,
    can_fd=False,
    hardware_filters=False,
    software_filters=False,
    replay=True,
    timestamps=True,
)
