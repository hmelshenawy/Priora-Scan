"""Minimal Vector ASC subset writer; full ASC fidelity is deferred."""

from __future__ import annotations

from pathlib import Path
from typing import TextIO

from prioracan.errors import CanLoggingError
from prioracan.frame import CanFrame


class AscLogger:
    def __init__(self, path: str | Path) -> None:
        self._path = Path(path)
        self._file: TextIO | None = None

    def open(self) -> None:
        try:
            self._file = self._path.open("w", encoding="utf-8")
            self._file.write("date Mon Jun 29 00:00:00 2026\n")
            self._file.write("base hex timestamps absolute\n")
        except OSError as exc:
            raise CanLoggingError(str(exc)) from exc

    def write_frame(self, frame: CanFrame) -> None:
        if self._file is None:
            raise CanLoggingError("logger is not open")
        try:
            self._file.write(_line(frame) + "\n")
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


def _line(frame: CanFrame) -> str:
    data = " ".join(f"{byte:02X}" for byte in frame.data)
    channel = frame.channel if isinstance(frame.channel, int) else 1
    return f"{frame.timestamp:.6f} {channel} {frame.arbitration_id:X} Rx d {frame.dlc} {data}".rstrip()
