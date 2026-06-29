from dataclasses import FrozenInstanceError

import pytest

from prioracan.errors import CanConfigurationError
from prioracan.frame import CanFrame, Direction


def make_frame(**overrides: object) -> CanFrame:
    values = {
        "timestamp": 1.0,
        "channel": 0,
        "direction": Direction.RX,
        "arbitration_id": 0x4D2,
        "is_extended_id": False,
        "is_remote_frame": False,
        "is_error_frame": False,
        "dlc": 2,
        "data": b"\x01\x02",
    }
    values.update(overrides)
    return CanFrame(**values)


def test_valid_standard_frame_hex_and_hash() -> None:
    frame = make_frame()
    assert frame.arbitration_id_hex == "0x4D2"
    assert frame.data_hex == "01 02"
    assert hash(frame)


def test_valid_extended_frame() -> None:
    frame = make_frame(arbitration_id=0x1ABCDE, is_extended_id=True)
    assert frame.arbitration_id_hex == "0x1ABCDE"


def test_immutable() -> None:
    frame = make_frame()
    with pytest.raises(FrozenInstanceError):
        frame.dlc = 1


@pytest.mark.parametrize(
    "overrides",
    [
        {"direction": Direction.TX},
        {"arbitration_id": 0x800},
        {"arbitration_id": 0x20000000, "is_extended_id": True},
        {"dlc": 9, "data": b"123456789"},
        {"dlc": 1},
        {"data": bytearray(b"\x01\x02")},
    ],
)
def test_invalid_frame_values_rejected(overrides: dict[str, object]) -> None:
    with pytest.raises(CanConfigurationError):
        make_frame(**overrides)


def test_remote_empty_frame_and_named_channel() -> None:
    frame = make_frame(channel="can0", is_remote_frame=True, dlc=0, data=b"")
    assert frame.channel == "can0"
    assert frame.data_hex == ""
