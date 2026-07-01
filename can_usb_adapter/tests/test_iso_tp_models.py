import pytest

from prioracan.errors import CanAdapterError, CanConfigurationError
from prioracan.iso_tp import IsoTpConfig, IsoTpTimeoutError
from prioracan.iso_tp.errors import IsoTpFrameFormatError
from prioracan.iso_tp.flow_control import (
    FlowControlParameters,
    FlowStatus,
    decode_flow_control,
    encode_flow_control,
)
from prioracan.iso_tp.frames import (
    FrameType,
    decode_consecutive_frame,
    decode_first_frame,
    decode_single_frame,
    encode_consecutive_frame,
    encode_first_frame,
    encode_single_frame,
    parse_pci,
)


def test_pci_nibble_parsing_for_all_frame_types() -> None:
    assert parse_pci(b"\x00") is FrameType.SINGLE_FRAME
    assert parse_pci(b"\x10") is FrameType.FIRST_FRAME
    assert parse_pci(b"\x20") is FrameType.CONSECUTIVE_FRAME
    assert parse_pci(b"\x30") is FrameType.FLOW_CONTROL


def test_single_frame_round_trip_and_boundary() -> None:
    for size in range(8):
        payload = bytes(range(size))
        assert decode_single_frame(encode_single_frame(payload)).payload == payload
    with pytest.raises(Exception):
        encode_single_frame(bytes(range(8)))


def test_first_frame_round_trip_and_boundaries() -> None:
    encoded = encode_first_frame(4095, b"abcdef")
    decoded = decode_first_frame(encoded)
    assert (decoded.length, decoded.payload) == (4095, b"abcdef")
    with pytest.raises(IsoTpFrameFormatError):
        encode_first_frame(4096, b"")
    with pytest.raises(IsoTpFrameFormatError):
        decode_first_frame(b"\x10\x00")


def test_consecutive_frame_sequence_round_trip_wrap() -> None:
    for sequence in range(16):
        frame = decode_consecutive_frame(encode_consecutive_frame(sequence, b"abc"))
        assert (frame.sequence_number, frame.payload) == (sequence, b"abc")


def test_flow_control_round_trip_and_st_min_boundaries() -> None:
    parameters = FlowControlParameters(FlowStatus.CTS, block_size=8, st_min_ms=127)
    assert decode_flow_control(encode_flow_control(parameters)) == parameters
    with pytest.raises(IsoTpFrameFormatError):
        decode_flow_control(b"\x30\x00\x80")
    with pytest.raises(IsoTpFrameFormatError):
        decode_flow_control(b"\x30\x00\xff")


def test_config_range_validation() -> None:
    assert IsoTpConfig(rx_arbitration_id=0x123, tx_arbitration_id=0x456)
    with pytest.raises(CanConfigurationError):
        IsoTpConfig(rx_arbitration_id=0x800, tx_arbitration_id=0x456)
    with pytest.raises(IsoTpFrameFormatError):
        IsoTpConfig(rx_arbitration_id=1, tx_arbitration_id=2, max_payload_bytes=4096)


def test_error_class_hierarchy() -> None:
    assert isinstance(IsoTpTimeoutError(), CanAdapterError)
