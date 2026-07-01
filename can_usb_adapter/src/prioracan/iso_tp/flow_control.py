from dataclasses import dataclass
from enum import Enum

from prioracan.iso_tp.errors import IsoTpFrameFormatError
from prioracan.iso_tp.frames import FrameType, parse_pci


class FlowStatus(Enum):
    CTS = 0x0
    WAIT = 0x1
    OVERFLOW = 0x2


@dataclass(frozen=True, slots=True)
class FlowControlParameters:
    status: FlowStatus
    block_size: int = 0
    st_min_ms: int = 0

    def __post_init__(self) -> None:
        if not isinstance(self.status, FlowStatus):
            raise IsoTpFrameFormatError("invalid flow status")
        _require_byte(self.block_size, "block_size")
        if not 0 <= self.st_min_ms <= 0x7F:
            raise IsoTpFrameFormatError("invalid separation time")


def encode_flow_control(parameters: FlowControlParameters) -> bytes:
    return bytes(
        [0x30 | parameters.status.value, parameters.block_size, parameters.st_min_ms]
    )


def decode_flow_control(data: bytes) -> FlowControlParameters:
    if parse_pci(data) is not FrameType.FLOW_CONTROL or len(data) < 3:
        raise IsoTpFrameFormatError("malformed flow-control frame")
    try:
        status = FlowStatus(data[0] & 0x0F)
    except ValueError as exc:
        raise IsoTpFrameFormatError("invalid flow status") from exc
    return FlowControlParameters(status, data[1], _decode_st_min(data[2]))


def _decode_st_min(value: int) -> int:
    if 0 <= value <= 0x7F:
        return value
    raise IsoTpFrameFormatError("unsupported separation time encoding")


def _require_byte(value: int, name: str) -> None:
    if not isinstance(value, int) or not 0 <= value <= 0xFF:
        raise IsoTpFrameFormatError(f"{name} is out of range")
