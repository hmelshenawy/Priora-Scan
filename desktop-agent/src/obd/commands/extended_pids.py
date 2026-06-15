"""Extended PID reader functions for real-vehicle validation.

Reader functions for OBD-II Mode 01 PIDs 06, 07, 08, 09, 0B, 10, 11.
Each function follows the same three-state result pattern as health_pids.py:
  - _health_pid_result      → supported + available
  - _unavailable_pid_result → supported + unavailable (NO DATA, malformed)
  - _unsupported_pid_result → not in vehicle bitmap

These readers reuse _send_pid, _parse_bytes, and result factories
from health_pids.py — no duplication.
"""

from __future__ import annotations

from typing import Any, Dict

from src.obd.adapter import BaseAdapter
from src.obd.commands.health_pids import (
    _health_pid_result,
    _parse_bytes,
    _send_pid,
    _unavailable_pid_result,
    _unsupported_pid_result,
)


# ---------------------------------------------------------------------------
# PID 06 — Short Term Fuel Trim Bank 1
# ---------------------------------------------------------------------------

def read_stft_bank1(adapter: BaseAdapter, *, pid: str = "06") -> Dict[str, Any]:
    """Read STFT Bank 1 (PID 06). Formula: (A - 128) * 100 / 128, unit %."""
    hex_str = _send_pid(adapter, "01", "06")
    if hex_str is None:
        return _unsupported_pid_result(pid, "%")
    prefix = "4106"
    if not hex_str.startswith(prefix):
        return _unavailable_pid_result(pid, "%", hex_str)
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 1:
            return _unavailable_pid_result(pid, "%", hex_str)
        trim = (bytes_[0] - 128) * 100.0 / 128.0
        return _health_pid_result(pid, round(trim, 2), "%", hex_str)
    except (ValueError, IndexError):
        return _unavailable_pid_result(pid, "%", hex_str)


# ---------------------------------------------------------------------------
# PID 07 — Long Term Fuel Trim Bank 1
# ---------------------------------------------------------------------------

def read_ltft_bank1(adapter: BaseAdapter, *, pid: str = "07") -> Dict[str, Any]:
    """Read LTFT Bank 1 (PID 07). Formula: (A - 128) * 100 / 128, unit %."""
    hex_str = _send_pid(adapter, "01", "07")
    if hex_str is None:
        return _unsupported_pid_result(pid, "%")
    prefix = "4107"
    if not hex_str.startswith(prefix):
        return _unavailable_pid_result(pid, "%", hex_str)
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 1:
            return _unavailable_pid_result(pid, "%", hex_str)
        trim = (bytes_[0] - 128) * 100.0 / 128.0
        return _health_pid_result(pid, round(trim, 2), "%", hex_str)
    except (ValueError, IndexError):
        return _unavailable_pid_result(pid, "%", hex_str)


# ---------------------------------------------------------------------------
# PID 08 — Short Term Fuel Trim Bank 2
# ---------------------------------------------------------------------------

def read_stft_bank2(adapter: BaseAdapter, *, pid: str = "08") -> Dict[str, Any]:
    """Read STFT Bank 2 (PID 08). Formula: (A - 128) * 100 / 128, unit %."""
    hex_str = _send_pid(adapter, "01", "08")
    if hex_str is None:
        return _unsupported_pid_result(pid, "%")
    prefix = "4108"
    if not hex_str.startswith(prefix):
        return _unavailable_pid_result(pid, "%", hex_str)
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 1:
            return _unavailable_pid_result(pid, "%", hex_str)
        trim = (bytes_[0] - 128) * 100.0 / 128.0
        return _health_pid_result(pid, round(trim, 2), "%", hex_str)
    except (ValueError, IndexError):
        return _unavailable_pid_result(pid, "%", hex_str)


# ---------------------------------------------------------------------------
# PID 09 — Long Term Fuel Trim Bank 2
# ---------------------------------------------------------------------------

def read_ltft_bank2(adapter: BaseAdapter, *, pid: str = "09") -> Dict[str, Any]:
    """Read LTFT Bank 2 (PID 09). Formula: (A - 128) * 100 / 128, unit %."""
    hex_str = _send_pid(adapter, "01", "09")
    if hex_str is None:
        return _unsupported_pid_result(pid, "%")
    prefix = "4109"
    if not hex_str.startswith(prefix):
        return _unavailable_pid_result(pid, "%", hex_str)
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 1:
            return _unavailable_pid_result(pid, "%", hex_str)
        trim = (bytes_[0] - 128) * 100.0 / 128.0
        return _health_pid_result(pid, round(trim, 2), "%", hex_str)
    except (ValueError, IndexError):
        return _unavailable_pid_result(pid, "%", hex_str)


# ---------------------------------------------------------------------------
# PID 0B — Intake Manifold Absolute Pressure (MAP)
# ---------------------------------------------------------------------------

def read_map(adapter: BaseAdapter, *, pid: str = "0B") -> Dict[str, Any]:
    """Read MAP (PID 0B). Formula: A, unit kPa."""
    hex_str = _send_pid(adapter, "01", "0B")
    if hex_str is None:
        return _unsupported_pid_result(pid, "kPa")
    prefix = "410B"
    if not hex_str.startswith(prefix):
        return _unavailable_pid_result(pid, "kPa", hex_str)
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 1:
            return _unavailable_pid_result(pid, "kPa", hex_str)
        pressure = float(bytes_[0])
        return _health_pid_result(pid, pressure, "kPa", hex_str)
    except (ValueError, IndexError):
        return _unavailable_pid_result(pid, "kPa", hex_str)


# ---------------------------------------------------------------------------
# PID 10 — Mass Air Flow (MAF)
# ---------------------------------------------------------------------------

def read_maf(adapter: BaseAdapter, *, pid: str = "10") -> Dict[str, Any]:
    """Read MAF (PID 10). Formula: (A * 256 + B) / 100, unit g/s."""
    hex_str = _send_pid(adapter, "01", "10")
    if hex_str is None:
        return _unsupported_pid_result(pid, "g/s")
    prefix = "4110"
    if not hex_str.startswith(prefix):
        return _unavailable_pid_result(pid, "g/s", hex_str)
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 2:
            return _unavailable_pid_result(pid, "g/s", hex_str)
        a, b = bytes_[0], bytes_[1]
        maf = (a * 256 + b) / 100.0
        return _health_pid_result(pid, round(maf, 2), "g/s", hex_str)
    except (ValueError, IndexError):
        return _unavailable_pid_result(pid, "g/s", hex_str)


# ---------------------------------------------------------------------------
# PID 11 — Throttle Position
# ---------------------------------------------------------------------------

def read_throttle_position(adapter: BaseAdapter, *, pid: str = "11") -> Dict[str, Any]:
    """Read Throttle Position (PID 11). Formula: A * 100 / 255, unit %."""
    hex_str = _send_pid(adapter, "01", "11")
    if hex_str is None:
        return _unsupported_pid_result(pid, "%")
    prefix = "4111"
    if not hex_str.startswith(prefix):
        return _unavailable_pid_result(pid, "%", hex_str)
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 1:
            return _unavailable_pid_result(pid, "%", hex_str)
        throttle = bytes_[0] * 100.0 / 255.0
        return _health_pid_result(pid, round(throttle, 2), "%", hex_str)
    except (ValueError, IndexError):
        return _unavailable_pid_result(pid, "%", hex_str)


# ---------------------------------------------------------------------------
# Configuration dictionaries
# ---------------------------------------------------------------------------

CONFIGURED_EXTENDED_PIDS: Dict[str, Any] = {
    "06": read_stft_bank1,
    "07": read_ltft_bank1,
    "08": read_stft_bank2,
    "09": read_ltft_bank2,
    "0B": read_map,
    "10": read_maf,
    "11": read_throttle_position,
}

EXTENDED_PID_NAMES: Dict[str, str] = {
    "06": "STFT Bank 1",
    "07": "LTFT Bank 1",
    "08": "STFT Bank 2",
    "09": "LTFT Bank 2",
    "0B": "MAP",
    "10": "MAF",
    "11": "Throttle Position",
}

EXTENDED_PID_UNITS: Dict[str, str] = {
    "06": "%",
    "07": "%",
    "08": "%",
    "09": "%",
    "0B": "kPa",
    "10": "g/s",
    "11": "%",
}