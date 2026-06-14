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
from src.obd.commands.elm_parser import compact_raw_response, is_adapter_error_response


def _debug(message: str) -> None:
    print(f"[OBD_HEALTH_DEBUG] {message}")


def _send_pid(adapter: BaseAdapter, mode: str, pid: str) -> Optional[str]:
    """Send a Mode/PID command and return the raw hex response string.

    Returns None when the adapter returns empty data (PID unsupported).
    """
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
    """Parse a hex string into a list of integer byte values,
    starting at the given offset (to skip response prefix bytes).
    """
    data = hex_str[offset:]
    if len(data) % 2 != 0:
        data = "0" + data
    _debug(f"parse_bytes fromhex_data={data!r} source={hex_str!r} offset={offset}")
    return [int(data[i : i + 2], 16) for i in range(0, len(data), 2)]


def _unsupported_point(unit: str = "") -> Dict[str, Any]:
    """Return a data point dict for an unsupported PID."""
    return {"value": None, "unit": unit, "supported": False}


def _health_pid_result(
    pid: str,
    value: float,
    unit: str,
    raw_response: str | None = None,
) -> Dict[str, Any]:
    """Return a HealthPidResult dict for a successfully read PID.

    HealthPidResult shape: {pid, value, unit, supported, available, rawResponse}.
    """
    return {
        "pid": pid,
        "value": value,
        "unit": unit,
        "supported": True,
        "available": True,
        "rawResponse": raw_response,
    }


def _unsupported_pid_result(pid: str, unit: str) -> Dict[str, Any]:
    """Return a HealthPidResult dict for a PID not supported by the vehicle.

    The vehicle's bitmap did not declare this PID, so it was never queried.
    """
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
    """Return a HealthPidResult dict for a supported PID that returned NO DATA.

    The vehicle's bitmap declared this PID, but the read returned no data
    or an unparseable response.
    """
    return {
        "pid": pid,
        "value": None,
        "unit": unit,
        "supported": True,
        "available": False,
        "rawResponse": raw_response,
    }


# ---------------------------------------------------------------------------
# PID 42 — Battery Voltage (Control Module Voltage)
# Formula: (A * 256 + B) / 1000  →  Volts
# ---------------------------------------------------------------------------

def read_battery_voltage(adapter: BaseAdapter, *, pid: str = "42") -> Dict[str, Any]:
    hex_str = _send_pid(adapter, "01", "42")
    if hex_str is None:
        return _unsupported_pid_result(pid, "V")
    # Response prefix: 41 42 (Mode 01 response + PID 42)
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


# ---------------------------------------------------------------------------
# PID 2F — Fuel Level Input
# Formula: A * 100 / 255  →  %
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# PID 0C — Engine RPM
# Formula: (A * 256 + B) / 4  →  RPM
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# PID 05 — Coolant Temperature
# Formula: A - 40  →  °C
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# PID 0D — Vehicle Speed
# Formula: A  →  km/h
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# PID 01 — Readiness Monitors (SAE J1979)
#
# Response format (after header "41 01"):
#   data[0] = Byte A: MIL (bit 7) + DTC count (bits 0-6)
#   data[1] = Byte B: Reserved (usually 0x00)
#   data[2] = Byte C: Continuous monitor COMPLETION (bits 0-2) + reserved
#   data[3] = Byte D: Non-continuous monitor COMPLETION (bits 0-7)
#   data[4] = Byte E: Continuous monitor AVAILABILITY (bits 0-2) + reserved
#   data[5] = Byte F: Non-continuous monitor AVAILABILITY (bits 0-7)
#
# Monitor names in SAE J1979 order:
#   Continuous (bits 0-2 of bytes C/E):
#     misfire, fuelSystem, components
#   Non-continuous (bits 0-7 of bytes D/F):
#     catalyst, heatedCatalyst, evap, secondaryAir,
#     acRefrigerant, oxygenSensor, oxygenSensorHeater, egrVvt
# ---------------------------------------------------------------------------

_MONITOR_NAMES = [
    "misfire",               # bit 0 of continuous group
    "fuelSystem",            # bit 1 of continuous group
    "components",            # bit 2 of continuous group
    "catalyst",              # bit 0 of non-continuous group
    "heatedCatalyst",        # bit 1
    "evap",                  # bit 2
    "secondaryAir",          # bit 3
    "acRefrigerant",         # bit 4
    "oxygenSensor",          # bit 5
    "oxygenSensorHeater",    # bit 6
    "egrVvt",                # bit 7
]


def parse_readiness_monitors(hex_str: str) -> Optional[Dict[str, Any]]:
    """Parse a raw PID 0101 response into a ReadinessResult dict.

    Takes a cleaned hex string (output of compact_raw_response or _send_pid)
    and returns a ReadinessResult dict, or None if parsing fails.

    ReadinessResult shape:
        {
            "milStatus": "ON" | "OFF" | "UNKNOWN",
            "storedDtcCount": int | None,
            "monitors": [
                {"name": str, "supported": bool, "ready": bool | None},
                ...
            ],
            "rawResponse": str
        }
    """
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

    # Extract MIL status and DTC count from byte 0
    byte_a = bytes_[0]
    mil_status = "ON" if (byte_a & 0x80) else "OFF"
    dtc_count = byte_a & 0x7F

    # Decode monitors using SAE J1979 byte mapping:
    #   data[2] = Byte C: continuous monitor COMPLETION (bits 0-2)
    #   data[3] = Byte D: non-continuous monitor COMPLETION (bits 0-7)
    #   data[4] = Byte E: continuous monitor AVAILABILITY (bits 0-2)
    #   data[5] = Byte F: non-continuous monitor AVAILABILITY (bits 0-7)
    # Default missing bytes to 0 (conservative: unsupported)
    completion_continuous = bytes_[2] if len(bytes_) > 2 else 0
    completion_noncontinuous = bytes_[3] if len(bytes_) > 3 else 0
    availability_continuous = bytes_[4] if len(bytes_) > 4 else 0
    availability_noncontinuous = bytes_[5] if len(bytes_) > 5 else 0

    monitors: list = []
    for i, name in enumerate(_MONITOR_NAMES):
        if i < 3:
            # Continuous monitors: bits 0-2
            is_supported = bool(availability_continuous & (1 << i))
            is_ready = bool(completion_continuous & (1 << i)) if is_supported else None
        else:
            # Non-continuous monitors: bits 0-7
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
    """Read OBD-II Mode 01 PID 01 (Readiness Monitors) from the vehicle.

    Returns a dict with outer compatibility wrapper:
        {"supported": True, "value": ReadinessResult}
    or {"supported": False, "value": {}}

    where ReadinessResult contains:
        milStatus, storedDtcCount, monitors[], rawResponse
    """
    hex_str = _send_pid(adapter, "01", "01")
    if hex_str is None:
        return {"supported": False, "value": {}}

    result = parse_readiness_monitors(hex_str)
    if result is None:
        return {"supported": False, "value": {}}

    return {"supported": True, "value": result}


# ---------------------------------------------------------------------------
# PID 00/20/40 — Supported PIDs (Mode 01) — bitmap chain-following
# Returns bitmask of PIDs 01-20 / 21-40 / 41-60 supported by the vehicle.
# After each bitmap, checks bit 32 (next-range indicator) to decide
# whether to query the next range. Stops when bit 32 is clear or NO DATA.
# ---------------------------------------------------------------------------

def _parse_bitmap(hex_str: str, prefix: str, base_offset: int) -> tuple[list[str], bool]:
    """Parse a 4-byte PID bitmap into a list of hex PIDs and a chain-continues flag.

    Args:
        hex_str: Raw hex response string (e.g., "4100BE1FB813").
        prefix: Expected response prefix (e.g., "4100", "4120", "4140").
        base_offset: PID base for this range (0 for 0100, 0x20 for 0120, 0x40 for 0140).

    Returns:
        Tuple of (list of supported hex PID strings, chain_continues bool).
        chain_continues is True when bit 32 is set (next range should be queried).
    """
    _debug(
        f"bitmap start prefix={prefix} base_offset=0x{base_offset:02X} response={hex_str!r}"
    )
    if not hex_str or not hex_str.startswith(prefix):
        _debug(f"bitmap reject prefix={prefix} response={hex_str!r}")
        return [], False
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 4:
            _debug(f"bitmap reject prefix={prefix} reason=short bytes={bytes_!r}")
            return [], False
        bitmask = (bytes_[0] << 24) | (bytes_[1] << 16) | (bytes_[2] << 8) | bytes_[3]
        pids: list[str] = []
        for bit in range(32):
            if bitmask & (1 << (31 - bit)):
                pids.append(f"{base_offset + bit + 1:02X}")
        # Bit 32 (LSB, value 1 in bitmask) = next range indicator
        chain_continues = bool(bitmask & 1)
        _debug(
            f"bitmap parsed prefix={prefix} bitmask=0x{bitmask:08X} pids={pids!r} chain={chain_continues}"
        )
        return pids, chain_continues
    except (ValueError, IndexError) as exc:
        _debug(f"bitmap failed prefix={prefix} response={hex_str!r} error={exc}")
        return [], False


def read_supported_pids(adapter: BaseAdapter) -> Dict[str, list[str]]:
    """Read supported PID masks and return a dict of mode → list of hex PIDs.

    Follows the SAE J1979 bitmap chain: after querying 0100, checks
    bit 32 to decide whether to query 0120. After 0120, checks bit 32
    for 0140. Continues until bit 32 is clear or response is NO DATA.

    Returns e.g. {"01": ["01", "03", "04", "05", ...], "09": ["02"]}
    """
    _debug("read_supported_pids start")
    supported: Dict[str, list[str]] = {"01": [], "09": []}

    # Mode 01 — start with PID 0100, follow chain
    chain_map = {
        "00": 0x00,   # 0100 → PIDs 01-20, base offset 0
        "20": 0x20,   # 0120 → PIDs 21-40, base offset 0x20
        "40": 0x40,   # 0140 → PIDs 41-60, base offset 0x40
        "60": 0x60,   # 0160 → PIDs 61-80, base offset 0x60
        "80": 0x80,   # 0180 → PIDs 81-A0, base offset 0x80
        "A0": 0xA0,   # 01A0 → PIDs A1-C0, base offset 0xA0
        "C0": 0xC0,   # 01C0 → PIDs C1-E0, base offset 0xC0
    }

    next_pid = "00"
    while next_pid in chain_map:
        prefix = f"41{next_pid}"
        base_offset = chain_map[next_pid]
        hex_str = _send_pid(adapter, "01", next_pid)
        pids, chain_continues = _parse_bitmap(hex_str, prefix, base_offset)
        supported["01"].extend(pids)
        _debug(
            f"read_supported_pids mode01 pid={next_pid} response={hex_str!r} pids={pids!r} chain={chain_continues}"
        )
        if not chain_continues:
            break
        # Compute next PID in chain (0x20 increments)
        next_offset = int(next_pid, 16) + 0x20
        next_pid = f"{next_offset:02X}"

    # Mode 09 PID 02 (VIN) — check with PID 00 for Mode 09
    hex_str_09 = _send_pid(adapter, "09", "00")
    _debug(f"read_supported_pids mode09 response={hex_str_09!r}")
    if hex_str_09 and hex_str_09.startswith("4900"):
        try:
            bytes_ = _parse_bytes(hex_str_09, 4)
            bitmask = (bytes_[0] << 24) | (bytes_[1] << 16) | (bytes_[2] << 8) | bytes_[3]
            # Bit 1 = PID 02
            if bitmask & (1 << (31 - 1)):
                supported["09"].append("02")
            _debug(f"read_supported_pids mode09 bitmask=0x{bitmask:08X} supported={supported['09']!r}")
        except (ValueError, IndexError) as exc:
            _debug(f"read_supported_pids mode09 parse failed response={hex_str_09!r} error={exc}")
            pass

    _debug(f"read_supported_pids result={supported!r}")
    return supported


# ---------------------------------------------------------------------------
# CONFIGURED_HEALTH_PIDS — the set of PIDs the Vehicle Health read considers
# Maps PID hex strings (without mode prefix) to their reader functions.
# ---------------------------------------------------------------------------

CONFIGURED_HEALTH_PIDS: Dict[str, Any] = {}  # populated after function defs


def _init_configured_health_pids() -> None:
    """Populate CONFIGURED_HEALTH_PIDS after all reader functions are defined.

    Called at module import time (bottom of this file).
    """
    global CONFIGURED_HEALTH_PIDS
    CONFIGURED_HEALTH_PIDS = {
        "04": read_engine_load,
        "05": read_coolant_temperature,
        "0C": read_rpm,
        "0D": read_vehicle_speed,
        "42": read_battery_voltage,
        "2F": read_fuel_level,
    }


# ---------------------------------------------------------------------------
# read_vehicle_health — orchestrate PID discovery + health reads
# ---------------------------------------------------------------------------

def read_vehicle_health(adapter: BaseAdapter) -> Dict[str, Any]:
    """Discover supported PIDs via bitmap chain, then read only supported health PIDs.

    Returns a VehicleHealthResult dict with:
    - Individual HealthPidResult per configured PID (keyed by name)
    - supportedHealthPids: list of hex PIDs the vehicle supports
    - unsupportedHealthPids: list of hex PIDs the vehicle does not support

    When PID 0100 discovery fails (NO DATA), falls back to reading
    all configured health PIDs.
    """
    _debug("read_vehicle_health start")
    # Step 1: Discover supported PIDs
    discovered = read_supported_pids(adapter)
    supported_mode01 = set(discovered.get("01", []))
    _debug(f"read_vehicle_health discovered={discovered!r}")

    # Step 2: Determine if discovery succeeded (0100 returned data)
    discovery_ok = len(supported_mode01) > 0

    # Step 3: Partition configured health PIDs into supported/unsupported
    if discovery_ok:
        supported_pids = [pid for pid in CONFIGURED_HEALTH_PIDS if pid in supported_mode01]
        unsupported_pids = [pid for pid in CONFIGURED_HEALTH_PIDS if pid not in supported_mode01]
    else:
        # Discovery failed — attempt all PIDs as fallback
        supported_pids = list(CONFIGURED_HEALTH_PIDS.keys())
        unsupported_pids = []
    _debug(
        f"read_vehicle_health discovery_ok={discovery_ok} supported={supported_pids!r} unsupported={unsupported_pids!r}"
    )

    # Step 4: Read each supported PID, report unsupported ones
    results: Dict[str, Any] = {}
    for pid in supported_pids:
        reader_fn = CONFIGURED_HEALTH_PIDS[pid]
        _debug(f"read_vehicle_health read pid={pid}")
        result = reader_fn(adapter)
        # If discovery says supported but reader says unsupported (NO DATA),
        # override to supported-but-unavailable.
        if discovery_ok and not result.get("supported", False):
            unit = _get_unit_for_pid(pid)
            raw = result.get("rawResponse")
            result = _unavailable_pid_result(pid, unit, raw)
        results[pid] = result
        _debug(f"read_vehicle_health result pid={pid} result={result!r}")

    for pid in unsupported_pids:
        reader_fn = CONFIGURED_HEALTH_PIDS[pid]
        unit = _get_unit_for_pid(pid)
        results[pid] = _unsupported_pid_result(pid, unit)

    # Step 5: Build VehicleHealthResult with named fields
    result_map = {
        "04": "calculatedEngineLoad",
        "05": "coolantTemperature",
        "0C": "rpm",
        "0D": "vehicleSpeed",
        "42": "batteryVoltage",
        "2F": "fuelLevel",
    }

    vehicle_health: Dict[str, Any] = {}
    for pid, field_name in result_map.items():
        vehicle_health[field_name] = results.get(pid, _unsupported_pid_result(pid, _get_unit_for_pid(pid)))

    vehicle_health["supportedHealthPids"] = supported_pids
    vehicle_health["unsupportedHealthPids"] = unsupported_pids

    _debug(f"read_vehicle_health final={vehicle_health!r}")
    return vehicle_health


def _get_unit_for_pid(pid: str) -> str:
    """Return the measurement unit for a configured health PID."""
    _UNIT_MAP = {
        "04": "%",
        "05": "°C",
        "0C": "RPM",
        "0D": "km/h",
        "42": "V",
        "2F": "%",
    }
    return _UNIT_MAP.get(pid, "")


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


# Initialize CONFIGURED_HEALTH_PIDS after all reader functions are defined
_init_configured_health_pids()
