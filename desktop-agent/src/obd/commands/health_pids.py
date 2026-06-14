"""Individual vehicle health PID readers."""

from __future__ import annotations

from typing import Any, Dict, Optional

from src.obd.adapter import BaseAdapter
from src.obd.commands.elm_parser import compact_raw_response, is_adapter_error_response


def _debug(message: str) -> None:
    print(f"[OBD_HEALTH_DEBUG] {message}")


def _send_pid(adapter: BaseAdapter, mode: str, pid: str) -> Optional[str]:
    command = f"{mode}{pid}"
    raw = adapter.send(command)
    _debug(f"TX {command} raw={raw!r}")
    if not raw:
        _debug(f"RX {command} empty")
        return None
    hex_str = compact_raw_response(raw, command=command)
    _debug(f"RX {command} cleaned={hex_str!r}")
    if not hex_str:
        return None
    if is_adapter_error_response(hex_str):
        _debug(f"RX {command} rejected error marker cleaned={hex_str!r}")
        return None
    if any(ch not in "0123456789ABCDEF" for ch in hex_str):
        _debug(f"RX {command} rejected non-hex cleaned={hex_str!r} raw={raw!r}")
        return None
    return hex_str


def _parse_bytes(hex_str: str, offset: int = 0) -> list[int]:
    data = hex_str[offset:]
    if len(data) % 2 != 0:
        data = "0" + data
    _debug(f"parse_bytes fromhex_data={data!r} source={hex_str!r} offset={offset}")
    return [int(data[i : i + 2], 16) for i in range(0, len(data), 2)]


def _unsupported_point(unit: str = "") -> Dict[str, Any]:
    return {"value": None, "unit": unit, "supported": False}


def _health_pid_result(
    pid: str,
    value: float,
    unit: str,
    raw_response: str | None = None,
) -> Dict[str, Any]:
    return {
        "pid": pid,
        "value": value,
        "unit": unit,
        "supported": True,
        "available": True,
        "rawResponse": raw_response,
    }


def _unsupported_pid_result(pid: str, unit: str) -> Dict[str, Any]:
    return {
        "pid": pid,
        "value": None,
        "unit": unit,
        "supported": False,
        "available": False,
        "rawResponse": None,
    }


def _unavailable_pid_result(
    pid: str, unit: str, raw_response: str | None = None
) -> Dict[str, Any]:
    return {
        "pid": pid,
        "value": None,
        "unit": unit,
        "supported": True,
        "available": False,
        "rawResponse": raw_response,
    }


def read_battery_voltage(adapter: BaseAdapter, *, pid: str = "42") -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "42")
    if hex_str is None:
        return _unsupported_pid_result(pid, "V")
    prefix = "4142"
    if not hex_str.startswith(prefix):
        return _unavailable_pid_result(pid, "V", hex_str)
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 2:
            return _unavailable_pid_result(pid, "V", hex_str)
        a, b = bytes_[0], bytes_[1]
        voltage = (a * 256 + b) / 1000.0
        return _health_pid_result(pid, round(voltage, 3), "V", hex_str)
    except (ValueError, IndexError):
        return _unavailable_pid_result(pid, "V", hex_str)


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
        return {
            "value": sys1_val,
            "supported": True,
            "details": {"system1": sys1_val, "system2": sys2_val},
        }
    except (ValueError, IndexError):
        return {"value": None, "supported": False, "details": {"system1": None, "system2": None}}


def read_engine_load(adapter: BaseAdapter, *, pid: str = "04") -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "04")
    if hex_str is None:
        return _unsupported_pid_result(pid, "%")
    prefix = "4104"
    if not hex_str.startswith(prefix):
        return _unavailable_pid_result(pid, "%", hex_str)
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 1:
            return _unavailable_pid_result(pid, "%", hex_str)
        load = bytes_[0] * 100.0 / 255.0
        return _health_pid_result(pid, round(load, 1), "%", hex_str)
    except (ValueError, IndexError):
        return _unavailable_pid_result(pid, "%", hex_str)


def read_fuel_level(adapter: BaseAdapter, *, pid: str = "2F") -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "2F")
    if hex_str is None:
        return _unsupported_pid_result(pid, "%")
    prefix = "412F"
    if not hex_str.startswith(prefix):
        return _unavailable_pid_result(pid, "%", hex_str)
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 1:
            return _unavailable_pid_result(pid, "%", hex_str)
        level = bytes_[0] * 100.0 / 255.0
        return _health_pid_result(pid, round(level, 1), "%", hex_str)
    except (ValueError, IndexError):
        return _unavailable_pid_result(pid, "%", hex_str)


def read_rpm(adapter: BaseAdapter, *, pid: str = "0C") -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "0C")
    if hex_str is None:
        return _unsupported_pid_result(pid, "RPM")
    prefix = "410C"
    if not hex_str.startswith(prefix):
        return _unavailable_pid_result(pid, "RPM", hex_str)
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 2:
            return _unavailable_pid_result(pid, "RPM", hex_str)
        a, b = bytes_[0], bytes_[1]
        rpm = (a * 256 + b) / 4.0
        return _health_pid_result(pid, round(rpm, 0), "RPM", hex_str)
    except (ValueError, IndexError):
        return _unavailable_pid_result(pid, "RPM", hex_str)


def read_coolant_temperature(adapter: BaseAdapter, *, pid: str = "05") -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "05")
    if hex_str is None:
        return _unsupported_pid_result(pid, "°C")
    prefix = "4105"
    if not hex_str.startswith(prefix):
        return _unavailable_pid_result(pid, "°C", hex_str)
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 1:
            return _unavailable_pid_result(pid, "°C", hex_str)
        temp = bytes_[0] - 40
        return _health_pid_result(pid, float(temp), "°C", hex_str)
    except (ValueError, IndexError):
        return _unavailable_pid_result(pid, "°C", hex_str)


def read_vehicle_speed(adapter: BaseAdapter, *, pid: str = "0D") -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "0D")
    if hex_str is None:
        return _unsupported_pid_result(pid, "km/h")
    prefix = "410D"
    if not hex_str.startswith(prefix):
        return _unavailable_pid_result(pid, "km/h", hex_str)
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 1:
            return _unavailable_pid_result(pid, "km/h", hex_str)
        speed = bytes_[0]
        return _health_pid_result(pid, float(speed), "km/h", hex_str)
    except (ValueError, IndexError):
        return _unavailable_pid_result(pid, "km/h", hex_str)


CONFIGURED_HEALTH_PIDS: Dict[str, Any] = {
    "04": read_engine_load,
    "05": read_coolant_temperature,
    "0C": read_rpm,
    "0D": read_vehicle_speed,
    "42": read_battery_voltage,
    "2F": read_fuel_level,
}


def _get_unit_for_pid(pid: str) -> str:
    unit_map = {
        "04": "%",
        "05": "°C",
        "0C": "RPM",
        "0D": "km/h",
        "42": "V",
        "2F": "%",
    }
    return unit_map.get(pid, "")


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
