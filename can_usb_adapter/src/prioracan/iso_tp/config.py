from dataclasses import dataclass

from prioracan.errors import CanConfigurationError
from prioracan.iso_tp.errors import IsoTpFrameFormatError


@dataclass(frozen=True, slots=True)
class IsoTpConfig:
    """Immutable configuration for the ISO-TP transport MVP."""

    rx_arbitration_id: int
    tx_arbitration_id: int
    is_extended_id: bool = False
    block_size: int = 0
    st_min_ms: int = 0
    wait_for_flow_control_seconds: float = 1.0
    wait_for_consecutive_frame_seconds: float = 1.0
    max_payload_bytes: int = 4095

    def __post_init__(self) -> None:
        max_id = 0x1FFFFFFF if self.is_extended_id else 0x7FF
        _require_range(self.rx_arbitration_id, 0, max_id, "rx_arbitration_id")
        _require_range(self.tx_arbitration_id, 0, max_id, "tx_arbitration_id")
        _require_range(self.block_size, 0, 0xFF, "block_size")
        _require_range(self.st_min_ms, 0, 0x7F, "st_min_ms")
        _require_positive(self.wait_for_flow_control_seconds, "wait_for_flow_control_seconds")
        _require_positive(
            self.wait_for_consecutive_frame_seconds,
            "wait_for_consecutive_frame_seconds",
        )
        if not 1 <= self.max_payload_bytes <= 4095:
            raise IsoTpFrameFormatError("invalid ISO-TP payload limit")


def _require_range(value: int, minimum: int, maximum: int, name: str) -> None:
    if not isinstance(value, int) or not minimum <= value <= maximum:
        raise CanConfigurationError(f"{name} is out of range")


def _require_positive(value: float, name: str) -> None:
    if not isinstance(value, (int, float)) or value <= 0:
        raise CanConfigurationError(f"{name} must be positive")
