from dataclasses import dataclass
from pathlib import Path

from prioracan.errors import CanConfigurationError


@dataclass(frozen=True, slots=True)
class CanUsbConfig:
    """Configuration for one USB-CAN receive session."""

    interface: str = "gs_usb"
    channel: int | str = 0
    bitrate: int = 500000
    receive_timeout_seconds: float = 1.0
    log_directory: str | Path | None = None
    jsonl_enabled: bool = False
    asc_enabled: bool = False

    def __post_init__(self) -> None:
        if not self.interface:
            raise CanConfigurationError("interface must be non-empty")
        if self.bitrate <= 0:
            raise CanConfigurationError("bitrate must be greater than zero")
        if self.receive_timeout_seconds < 0:
            raise CanConfigurationError("receive_timeout_seconds must be non-negative")
