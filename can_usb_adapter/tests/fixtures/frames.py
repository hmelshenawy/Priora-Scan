from prioracan.frame import CanFrame, Direction


def make_standard_frame(
    arbitration_id: int,
    data: bytes,
    *,
    timestamp: float = 1.0,
    channel: int | str = 0,
    is_remote_frame: bool = False,
) -> CanFrame:
    return CanFrame(
        timestamp=timestamp,
        channel=channel,
        direction=Direction.RX,
        arbitration_id=arbitration_id,
        is_extended_id=False,
        is_remote_frame=is_remote_frame,
        is_error_frame=False,
        dlc=len(data),
        data=data,
    )


def make_extended_frame(
    arbitration_id: int,
    data: bytes,
    *,
    timestamp: float = 1.0,
    channel: int | str = 0,
) -> CanFrame:
    return CanFrame(
        timestamp=timestamp,
        channel=channel,
        direction=Direction.RX,
        arbitration_id=arbitration_id,
        is_extended_id=True,
        is_remote_frame=False,
        is_error_frame=False,
        dlc=len(data),
        data=data,
    )


DETERMINISTIC_FRAMES = [
    make_standard_frame(0x100, b"\x11", timestamp=1.0),
    make_extended_frame(0x1ABCDE, b"\x22\x33", timestamp=2.0),
    make_standard_frame(0x200, b"", timestamp=3.0, is_remote_frame=True),
    make_standard_frame(0x300, b"", timestamp=4.0),
    make_standard_frame(0x7FF, b"\x01\x02\x03\x04\x05\x06\x07\x08", timestamp=5.0),
]
