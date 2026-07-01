from dataclasses import dataclass
from enum import Enum

from prioracan.iso_tp.errors import IsoTpBufferOverflowError, IsoTpFrameFormatError


class FrameType(Enum):
    SINGLE_FRAME = 0x0
    FIRST_FRAME = 0x1
    CONSECUTIVE_FRAME = 0x2
    FLOW_CONTROL = 0x3


@dataclass(frozen=True, slots=True)
class SingleFrame:
    payload: bytes


@dataclass(frozen=True, slots=True)
class FirstFrame:
    length: int
    payload: bytes


@dataclass(frozen=True, slots=True)
class ConsecutiveFrame:
    sequence_number: int
    payload: bytes


def parse_pci(data: bytes) -> FrameType:
    if not data:
        raise IsoTpFrameFormatError("missing PCI byte")
    nibble = data[0] >> 4
    try:
        return FrameType(nibble)
    except ValueError as exc:
        raise IsoTpFrameFormatError("unsupported ISO-TP frame type") from exc


def encode_single_frame(payload: bytes) -> bytes:
    if len(payload) > 7:
        raise IsoTpBufferOverflowError("single-frame payload is too large")
    return bytes([len(payload)]) + payload


def decode_single_frame(data: bytes) -> SingleFrame:
    _require_type(data, FrameType.SINGLE_FRAME)
    length = data[0] & 0x0F
    if length > len(data) - 1:
        raise IsoTpFrameFormatError("single-frame length exceeds payload")
    return SingleFrame(data[1 : 1 + length])


def encode_first_frame(length: int, payload: bytes) -> bytes:
    if not 8 <= length <= 4095:
        raise IsoTpFrameFormatError("first-frame length is out of range")
    if len(payload) > 6:
        raise IsoTpFrameFormatError("first-frame payload is too large")
    return bytes([0x10 | (length >> 8), length & 0xFF]) + payload


def decode_first_frame(data: bytes) -> FirstFrame:
    _require_type(data, FrameType.FIRST_FRAME)
    if len(data) < 2:
        raise IsoTpFrameFormatError("first-frame header is incomplete")
    length = ((data[0] & 0x0F) << 8) | data[1]
    if length == 0:
        raise IsoTpFrameFormatError("escape length is not supported")
    if length > 4095:
        raise IsoTpBufferOverflowError("first-frame length is too large")
    return FirstFrame(length, data[2:])


def encode_consecutive_frame(sequence_number: int, payload: bytes) -> bytes:
    if not 0 <= sequence_number <= 0x0F:
        raise IsoTpFrameFormatError("sequence number is out of range")
    if len(payload) > 7:
        raise IsoTpFrameFormatError("consecutive-frame payload is too large")
    return bytes([0x20 | sequence_number]) + payload


def decode_consecutive_frame(data: bytes) -> ConsecutiveFrame:
    _require_type(data, FrameType.CONSECUTIVE_FRAME)
    return ConsecutiveFrame(data[0] & 0x0F, data[1:])


def _require_type(data: bytes, expected: FrameType) -> None:
    if parse_pci(data) is not expected:
        raise IsoTpFrameFormatError("unexpected ISO-TP frame type")
