from dataclasses import dataclass
from enum import Enum

from prioracan.errors import CanConfigurationError
from prioracan.utils.hex import arbitration_id_hex, data_hex


class Direction(Enum):
    """CAN frame direction; only RX is accepted by this foundation."""

    RX = "RX"
    TX = "TX"


@dataclass(frozen=True, slots=True)
class CanFrame:
    """Immutable validated Classic CAN receive frame."""

    timestamp: float
    channel: int | str
    direction: Direction
    arbitration_id: int
    is_extended_id: bool
    is_remote_frame: bool
    is_error_frame: bool
    dlc: int
    data: bytes
    bitrate: int | None = None

    def __post_init__(self) -> None:
        if self.direction != Direction.RX:
            raise CanConfigurationError("CAN frames are RX-only in this feature")
        if not isinstance(self.data, bytes):
            raise CanConfigurationError("data must be bytes")
        if not 0 <= len(self.data) <= 8:
            raise CanConfigurationError("Classic CAN payload must be 0..8 bytes")
        if self.dlc != len(self.data):
            raise CanConfigurationError("dlc must equal len(data)")
        self._validate_arbitration_id()

    def _validate_arbitration_id(self) -> None:
        max_id = 0x1FFFFFFF if self.is_extended_id else 0x7FF
        if not 0 <= self.arbitration_id <= max_id:
            raise CanConfigurationError("arbitration_id is out of range")

    @property
    def arbitration_id_hex(self) -> str:
        return arbitration_id_hex(self.arbitration_id)

    @property
    def data_hex(self) -> str:
        return data_hex(self.data)
