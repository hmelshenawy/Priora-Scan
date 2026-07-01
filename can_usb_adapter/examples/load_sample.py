from __future__ import annotations

import json
from pathlib import Path

from prioracan.frame import CanFrame, Direction


SAMPLE_PATH = Path(__file__).parent / "fixtures" / "sample_yaris.jsonl"


def load_sample_frames(path: str | Path | None = None) -> list[CanFrame]:
    sample_path = Path(path) if path is not None else SAMPLE_PATH
    if not sample_path.exists():
        return []
    return [_frame_from_record(json.loads(line)) for line in sample_path.read_text().splitlines()]


def _frame_from_record(record: dict[str, object]) -> CanFrame:
    data_hex = str(record.get("data_hex", ""))
    data = bytes.fromhex(data_hex) if data_hex else b""
    return CanFrame(
        timestamp=float(record["timestamp"]),
        channel=record["channel"],
        direction=Direction.RX,
        arbitration_id=int(record["arbitration_id"]),
        is_extended_id=bool(record["is_extended_id"]),
        is_remote_frame=bool(record["is_remote_frame"]),
        is_error_frame=bool(record["is_error_frame"]),
        dlc=int(record["dlc"]),
        data=data,
        bitrate=record.get("bitrate"),
    )
