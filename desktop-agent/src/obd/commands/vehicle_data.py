"""Vehicle data PID readers — Feature 009 Phase A.

One-shot readers for standard OBD-II vehicle data points.
Each function sends a PID command to the adapter and returns a
data point dict matching the API contract shape:

    { "value": <decoded>, "unit": "V"|"%"|"km"|..., "supported": true|false }

When the adapter returns no data or an error, the function returns
``{ "value": null, "unit": "...", "supported": false }`` instead of
raising — this allows the vehicle health read to succeed even when
some PIDs are unsupported.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from src.obd.adapter import BaseAdapter


def _send_pid(adapter: BaseAdapter, mode: str, pid: str) -> Optional[str]:
    """Send a Mode/PID command and return the raw hex response string.

    Returns None when the adapter returns empty data (PID unsupported).
    """
    command = f"{mode}{pid}"
    raw = adapter.send(command)
    if not raw:
        return None
    hex_str = raw.decode("utf-8", errors="ignore").replace(" ", "").replace("\r", "").replace("\n", "")
    if not hex_str:
        return None
    return hex_str


def _parse_bytes(hex_str: str, offset: int = 0) -> list[int]:
    """Parse a hex string into a list of integer byte values,
    starting at the given offset (to skip response prefix bytes).
    """
    data = hex_str[offset:]
    if len(data) % 2 != 0:
        data = "0" + data
    return [int(data[i : i + 2], 16) for i in range(0, len(data), 2)]


def _unsupported_point(unit: str = "") -> Dict[str, Any]:
    """Return a data point dict for an unsupported PID."""
    return {"value": None, "unit": unit, "supported": False}


# ---------------------------------------------------------------------------
# PID 42 — Battery Voltage (Control Module Voltage)
# Formula: (A * 256 + B) / 1000  →  Volts
# ---------------------------------------------------------------------------

def read_battery_voltage(adapter: BaseAdapter) -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "42")
    if hex_str is None:
        return _unsupported_point("V")
    # Response prefix: 41 42 (Mode 01 response + PID 42)
    prefix = "4142"
    if not hex_str.startswith(prefix):
        return _unsupported_point("V")
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 2:
            return _unsupported_point("V")
        a, b = bytes_[0], bytes_[1]
        voltage = (a * 256 + b) / 1000.0
        return {"value": round(voltage, 1), "unit": "V", "supported": True}
    except (ValueError, IndexError):
        return _unsupported_point("V")


# ---------------------------------------------------------------------------
# PID 03 — Fuel System Status
# Byte A: Fuel System 1, Byte B: Fuel System 2
# ---------------------------------------------------------------------------

_FUEL_SYSTEM_STATUS_MAP = {
    0x01: "Open Loop - Temperature",
    0x02: "Closed Loop",
    0x04: "Open Loop - Load",
    0x08: "Open Loop - Fault",
    0x10: "Closed Loop - Fault",
}


def read_fuel_system_status(adapter: BaseAdapter) -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "03")
    if hex_str is None:
        return {"value": None, "supported": False, "details": {"system1": None, "system2": None}}
    prefix = "4103"
    if not hex_str.startswith(prefix):
        return {"value": None, "supported": False, "details": {"system1": None, "system2": None}}
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 2:
            return {"value": None, "supported": False, "details": {"system1": None, "system2": None}}
        sys1_val = _FUEL_SYSTEM_STATUS_MAP.get(bytes_[0], f"Unknown (0x{bytes_[0]:02X})")
        sys2_val = _FUEL_SYSTEM_STATUS_MAP.get(bytes_[1], None) if bytes_[1] != 0 else None
        primary = sys1_val
        return {
            "value": primary,
            "supported": True,
            "details": {"system1": sys1_val, "system2": sys2_val},
        }
    except (ValueError, IndexError):
        return {"value": None, "supported": False, "details": {"system1": None, "system2": None}}


# ---------------------------------------------------------------------------
# PID 04 — Calculated Engine Load
# Formula: A * 100 / 255  →  %
# ---------------------------------------------------------------------------

def read_engine_load(adapter: BaseAdapter) -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "04")
    if hex_str is None:
        return _unsupported_point("%")
    prefix = "4104"
    if not hex_str.startswith(prefix):
        return _unsupported_point("%")
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 1:
            return _unsupported_point("%")
        load = bytes_[0] * 100.0 / 255.0
        return {"value": round(load, 1), "unit": "%", "supported": True}
    except (ValueError, IndexError):
        return _unsupported_point("%")


# ---------------------------------------------------------------------------
# PID 2F — Fuel Level Input
# Formula: A * 100 / 255  →  %
# ---------------------------------------------------------------------------

def read_fuel_level(adapter: BaseAdapter) -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "2F")
    if hex_str is None:
        return _unsupported_point("%")
    prefix = "412F"
    if not hex_str.startswith(prefix):
        return _unsupported_point("%")
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 1:
            return _unsupported_point("%")
        level = bytes_[0] * 100.0 / 255.0
        return {"value": round(level, 1), "unit": "%", "supported": True}
    except (ValueError, IndexError):
        return _unsupported_point("%")


# ---------------------------------------------------------------------------
# PID 01 — Readiness Monitors
# 6-byte response: [MIL+DTFcount, DTCcount, supported_lo, supported_hi,
#                    complete_lo, complete_hi]
# ---------------------------------------------------------------------------

_MONITOR_NAMES = [
    "misfire",        # bit 0 of supported_lo
    "fuelSystem",     # bit 1
    "components",    # bit 2
    # bits 3-7 reserved
    "catalyst",       # bit 0 of supported_hi
    "heatedCatalyst", # bit 1
    "evap",           # bit 2
    "secondaryAir",   # bit 3
    "acRefrigerant",  # bit 4
    "oxygenSensor",   # bit 5
    "oxygenSensorHeater", # bit 6
    "egrVvt",         # bit 7
]


def read_readiness_monitors(adapter: BaseAdapter) -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "01")
    if hex_str is None:
        return {"supported": False, "value": {}}
    prefix = "4101"
    if not hex_str.startswith(prefix):
        return {"supported": False, "value": {}}
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        # Need at least 4 bytes after the 2 header bytes:
        # supported_lo (byte 2), supported_hi (byte 3),
        # complete_lo (byte 4), complete_hi (byte 5)
        if len(bytes_) < 4:
            return {"supported": False, "value": {}}
        supported_lo = bytes_[2]
        supported_hi = bytes_[3]
        complete_lo = bytes_[4] if len(bytes_) > 4 else 0
        complete_hi = bytes_[5] if len(bytes_) > 5 else 0

        monitors: Dict[str, Dict[str, Any]] = {}
        for i, name in enumerate(_MONITOR_NAMES):
            if i < 3:
                # Lower 3 bits of supported_lo
                is_supported = bool(supported_lo & (1 << i))
                is_complete = bool(complete_lo & (1 << i)) if is_supported else None
            else:
                # Upper 8 bits (shifted by 3 for the reserved bits)
                bit = i - 3
                is_supported = bool(supported_hi & (1 << bit))
                is_complete = bool(complete_hi & (1 << bit)) if is_supported else None
            monitors[name] = {"supported": is_supported, "complete": is_complete}

        return {"supported": True, "value": monitors}
    except (ValueError, IndexError):
        return {"supported": False, "value": {}}


# ---------------------------------------------------------------------------
# PID 00/20 — Supported PIDs (Mode 01)
# Returns bitmask of PIDs 01-20 / 21-40 supported by the vehicle.
# ---------------------------------------------------------------------------

def read_supported_pids(adapter: BaseAdapter) -> Dict[str, list[str]]:
    """Read supported PID masks and return a dict of mode → list of hex PIDs.

    Returns e.g. {"01": ["01", "03", "04", "05", ...], "09": ["02"]}
    """
    supported: Dict[str, list[str]] = {"01": [], "09": []}

    # Mode 01 PIDs 00-20 (4 bytes bitmask, 32 bits)
    hex_str = _send_pid(adapter, "01", "00")
    if hex_str and hex_str.startswith("4100"):
        try:
            bytes_ = _parse_bytes(hex_str, 4)
            bitmask = (bytes_[0] << 24) | (bytes_[1] << 16) | (bytes_[2] << 8) | bytes_[3]
            # Bit 0 = PID 01, bit 1 = PID 02, etc.
            for bit in range(32):
                if bitmask & (1 << (31 - bit)):
                    supported["01"].append(f"{bit + 1:02X}")
        except (ValueError, IndexError):
            pass

    # Mode 01 PIDs 21-40 (optional — PID 20)
    hex_str_20 = _send_pid(adapter, "01", "20")
    if hex_str_20 and hex_str_20.startswith("4120"):
        try:
            bytes_ = _parse_bytes(hex_str_20, 4)
            bitmask = (bytes_[0] << 24) | (bytes_[1] << 16) | (bytes_[2] << 8) | bytes_[3]
            for bit in range(32):
                if bitmask & (1 << (31 - bit)):
                    supported["01"].append(f"{0x21 + bit:02X}")
        except (ValueError, IndexError):
            pass

    # Mode 09 PID 02 (VIN) — check with PID 00 for Mode 09
    hex_str_09 = _send_pid(adapter, "09", "00")
    if hex_str_09 and hex_str_09.startswith("4900"):
        try:
            bytes_ = _parse_bytes(hex_str_09, 4)
            bitmask = (bytes_[0] << 24) | (bytes_[1] << 16) | (bytes_[2] << 8) | bytes_[3]
            # Bit 1 = PID 02
            if bitmask & (1 << (31 - 1)):
                supported["09"].append("02")
        except (ValueError, IndexError):
            pass

    return supported


# ---------------------------------------------------------------------------
# PID 31 — Distance Since DTC Clear (mileage proxy)
# Formula: A * 256 + B  →  km
# ---------------------------------------------------------------------------

def read_mileage(adapter: BaseAdapter) -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "31")
    if hex_str is None:
        return _unsupported_point("km")
    prefix = "4131"
    if not hex_str.startswith(prefix):
        return _unsupported_point("km")
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 2:
            return _unsupported_point("km")
        distance_km = bytes_[0] * 256 + bytes_[1]
        return {"value": distance_km, "unit": "km", "supported": True}
    except (ValueError, IndexError):
        return _unsupported_point("km")