from dataclasses import dataclass
from enum import Enum

from prioracan.errors import CanAdapterError


class DriverState(Enum):
    DISCONNECTED = "disconnected"
    CONNECTED = "connected"
    LISTENING = "listening"
    ERROR = "error"


@dataclass(frozen=True, slots=True)
class DriverStatus:
    state: DriverState
    adapter_name: str | None = None
    serial_number: str | None = None
    firmware: str | None = None
    bitrate: int | None = None
    channel: int | str | None = None
    last_error: CanAdapterError | None = None
    received_frame_count: int = 0
