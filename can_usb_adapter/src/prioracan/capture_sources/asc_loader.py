from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

from prioracan.frame import CanFrame, Direction


def load_asc_frames(path: str | Path) -> tuple[CanFrame, ...]:
    return parse_asc_lines(Path(path).read_text(encoding="utf-8", errors="ignore").splitlines())


def parse_asc_lines(lines: Iterable[str]) -> tuple[CanFrame, ...]:
    frames: list[CanFrame] = []
    for line in lines:
        frame = _parse_line(line)
        if frame is not None:
            frames.append(frame)
    return tuple(frames)


def _parse_line(line: str) -> CanFrame | None:
    parts = line.split()
    if len(parts) < 6 or not _is_float(parts[0]):
        return None
    direction = parts[3].upper()
    frame_type = parts[4].lower()
    if direction != "RX" or frame_type != "d":
        return None
    dlc = _parse_int(parts[5], 10)
    data = _parse_data(parts[6 : 6 + dlc])
    if dlc is None or data is None or len(data) != dlc:
        return None
    arbitration_id, is_extended = _parse_arbitration_id(parts[2])
    if arbitration_id is None:
        return None
    return CanFrame(
        timestamp=float(parts[0]),
        channel=_parse_channel(parts[1]),
        direction=Direction.RX,
        arbitration_id=arbitration_id,
        is_extended_id=is_extended,
        is_remote_frame=False,
        is_error_frame=False,
        dlc=dlc,
        data=data,
    )


def _parse_arbitration_id(value: str) -> tuple[int | None, bool]:
    lowered = value.lower()
    is_extended = lowered.endswith("x")
    raw = lowered[:-1] if is_extended else lowered
    return _parse_int(raw, 16), is_extended


def _parse_data(values: list[str]) -> bytes | None:
    try:
        return bytes(int(value, 16) for value in values)
    except ValueError:
        return None


def _parse_channel(value: str) -> int | str:
    return int(value) if value.isdigit() else value


def _parse_int(value: str, base: int) -> int | None:
    try:
        return int(value, base)
    except ValueError:
        return None


def _is_float(value: str) -> bool:
    try:
        float(value)
    except ValueError:
        return False
    return True
