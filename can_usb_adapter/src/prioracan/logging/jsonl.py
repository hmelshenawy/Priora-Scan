from __future__ import annotations

import json
from pathlib import Path
from typing import TextIO

from prioracan.errors import CanLoggingError
from prioracan.frame import CanFrame


class JsonlLogger:
    """Frame logger that writes one JSON object per line."""

    def __init__(self, path: str | Path) -> None:
        self._path = Path(path)
        self._file: TextIO | None = None

    def open(self) -> None:
        try:
            self._file = self._path.open("w", encoding="utf-8")
        except OSError as exc:
            raise CanLoggingError(str(exc)) from exc

    def write_frame(self, frame: CanFrame) -> None:
        if self._file is None:
            raise CanLoggingError("logger is not open")
        try:
            self._file.write(json.dumps(_record(frame), separators=(",", ":")) + "\n")
        except OSError as exc:
            raise CanLoggingError(str(exc)) from exc

    def close(self) -> None:
        if self._file is None:
            return
        file = self._file
        self._file = None
        try:
            file.flush()
            file.close()
        except OSError as exc:
            raise CanLoggingError(str(exc)) from exc


def _record(frame: CanFrame) -> dict[str, object]:
    record = {
        "timestamp": frame.timestamp,
        "channel": frame.channel,
        "direction": frame.direction.value,
        "arbitration_id": frame.arbitration_id,
        "arbitration_id_hex": frame.arbitration_id_hex,
        "is_extended_id": frame.is_extended_id,
        "is_remote_frame": frame.is_remote_frame,
        "is_error_frame": frame.is_error_frame,
        "dlc": frame.dlc,
        "data_hex": frame.data_hex,
    }
    if frame.bitrate is not None:
        record["bitrate"] = frame.bitrate
    return record
