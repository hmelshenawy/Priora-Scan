"""Readiness monitor parsing and reading."""

from __future__ import annotations

from typing import Any, Dict, Optional

from src.obd.adapter import BaseAdapter
from src.obd.commands.health_pids import _parse_bytes, _send_pid


_MONITOR_NAMES = [
    "misfire",
    "fuelSystem",
    "components",
    "catalyst",
    "heatedCatalyst",
    "evap",
    "secondaryAir",
    "acRefrigerant",
    "oxygenSensor",
    "oxygenSensorHeater",
    "egrVvt",
]


def parse_readiness_monitors(hex_str: str) -> Optional[Dict[str, Any]]:
    if hex_str is None or not hex_str:
        return None

    prefix = "4101"
    if not hex_str.startswith(prefix):
        return None

    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
    except (ValueError, IndexError):
        return None

    if len(bytes_) < 1:
        return None

    byte_a = bytes_[0]
    mil_status = "ON" if (byte_a & 0x80) else "OFF"
    dtc_count = byte_a & 0x7F

    completion_continuous = bytes_[2] if len(bytes_) > 2 else 0
    completion_noncontinuous = bytes_[3] if len(bytes_) > 3 else 0
    availability_continuous = bytes_[4] if len(bytes_) > 4 else 0
    availability_noncontinuous = bytes_[5] if len(bytes_) > 5 else 0

    monitors: list = []
    for i, name in enumerate(_MONITOR_NAMES):
        if i < 3:
            is_supported = bool(availability_continuous & (1 << i))
            is_ready = bool(completion_continuous & (1 << i)) if is_supported else None
        else:
            bit = i - 3
            is_supported = bool(availability_noncontinuous & (1 << bit))
            is_ready = bool(completion_noncontinuous & (1 << bit)) if is_supported else None
        monitors.append({"name": name, "supported": is_supported, "ready": is_ready})

    return {
        "milStatus": mil_status,
        "storedDtcCount": dtc_count,
        "monitors": monitors,
        "rawResponse": hex_str,
    }


def read_readiness_monitors(adapter: BaseAdapter) -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "01")
    if hex_str is None:
        return {"supported": False, "value": {}}

    result = parse_readiness_monitors(hex_str)
    if result is None:
        return {"supported": False, "value": {}}

    return {"supported": True, "value": result}
