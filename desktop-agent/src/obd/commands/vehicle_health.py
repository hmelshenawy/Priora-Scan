"""Vehicle health orchestration across configured health PIDs."""

from __future__ import annotations

from typing import Any, Dict

from src.obd.adapter import BaseAdapter
from src.obd.commands.extended_pids import (
    CONFIGURED_EXTENDED_PIDS,
    EXTENDED_PID_UNITS,
)
from src.obd.commands.health_pids import (
    CONFIGURED_HEALTH_PIDS,
    _debug,
    _get_unit_for_pid,
    _unavailable_pid_result,
    _unsupported_pid_result,
)
from src.obd.commands.supported_pids import read_supported_pids


def _classify_unavailable_reason(result: Dict[str, Any]) -> str:
    """Classify why a PID read failed based on the reader result.

    Returns one of:
      - "NO_DATA": adapter returned no response (rawResponse is None)
      - "PREFIX_MISMATCH": response prefix doesn't match expected PID
      - "INVALID_RESPONSE": response couldn't be parsed (malformed hex, too few bytes)
    """
    raw = result.get("rawResponse")

    # If adapter returned nothing at all, it's NO DATA
    if raw is None:
        return "NO_DATA"

    # If raw response exists but result is unavailable, classify by what we can infer
    pid = result.get("pid", "")
    expected_prefix = f"41{pid}"

    if raw and not raw.startswith(expected_prefix):
        return "PREFIX_MISMATCH"

    # Default to INVALID_RESPONSE for other parsing failures
    return "INVALID_RESPONSE"


# Map PID hex codes to the field names used in the vehicle_health result dict.
_EXTENDED_PID_FIELD_MAP: Dict[str, str] = {
    "06": "stftBank1",
    "07": "ltftBank1",
    "08": "stftBank2",
    "09": "ltftBank2",
    "0B": "map",
    "10": "maf",
    "11": "throttlePosition",
}


def read_vehicle_health(adapter: BaseAdapter) -> Dict[str, Any]:
    _debug("read_vehicle_health start")
    discovered = read_supported_pids(adapter)
    supported_mode01 = set(discovered.get("01", []))
    _debug(f"read_vehicle_health discovered={discovered!r}")

    discovery_ok = len(supported_mode01) > 0

    if discovery_ok:
        supported_pids = [pid for pid in CONFIGURED_HEALTH_PIDS if pid in supported_mode01]
        unsupported_pids = [pid for pid in CONFIGURED_HEALTH_PIDS if pid not in supported_mode01]
    else:
        supported_pids = list(CONFIGURED_HEALTH_PIDS.keys())
        unsupported_pids = []
    _debug(
        f"read_vehicle_health discovery_ok={discovery_ok} supported={supported_pids!r} unsupported={unsupported_pids!r}"
    )

    results: Dict[str, Any] = {}
    for pid in supported_pids:
        reader_fn = CONFIGURED_HEALTH_PIDS[pid]
        _debug(f"read_vehicle_health read pid={pid}")
        result = reader_fn(adapter)
        if discovery_ok and not result.get("supported", False):
            unit = _get_unit_for_pid(pid)
            raw = result.get("rawResponse")
            result = _unavailable_pid_result(pid, unit, raw)
        results[pid] = result
        _debug(f"read_vehicle_health result pid={pid} result={result!r}")

    for pid in unsupported_pids:
        unit = _get_unit_for_pid(pid)
        results[pid] = _unsupported_pid_result(pid, unit)

    # -----------------------------------------------------------------------
    # Extended PID polling (Feature 018B)
    # -----------------------------------------------------------------------
    # Extended PIDs are polled alongside health PIDs but with different
    # discovery failure behavior: when PID discovery fails, extended PIDs
    # are NOT blindly queried. Instead, each extended PID is marked as
    # unavailable with reason "PID_DISCOVERY_FAILED".
    # -----------------------------------------------------------------------

    extended_results: Dict[str, Any] = {}

    if discovery_ok:
        # Discovery succeeded — read supported extended PIDs, skip unsupported
        for pid_hex, reader_fn in CONFIGURED_EXTENDED_PIDS.items():
            if pid_hex in supported_mode01:
                # PID is in the vehicle bitmap — read it
                _debug(f"read_vehicle_health read extended pid={pid_hex}")
                result = reader_fn(adapter)
                # If reader returned unsupported for a PID that was in the bitmap,
                # surface the discrepancy with a reason field.
                if not result.get("supported", False):
                    unit = EXTENDED_PID_UNITS.get(pid_hex, "")
                    raw = result.get("rawResponse")
                    result = _unavailable_pid_result(pid_hex, unit, raw)
                    result["reason"] = _classify_unavailable_reason(result)
                elif not result.get("available", True):
                    result["reason"] = _classify_unavailable_reason(result)
                extended_results[pid_hex] = result
                _debug(f"read_vehicle_health extended pid={pid_hex} result={result!r}")
            else:
                # PID is NOT in the vehicle bitmap — mark as unsupported
                unit = EXTENDED_PID_UNITS.get(pid_hex, "")
                extended_results[pid_hex] = _unsupported_pid_result(pid_hex, unit)
                _debug(f"read_vehicle_health extended pid={pid_hex} unsupported")
    else:
        # Discovery failed — do NOT blindly query extended PIDs.
        # Mark each one as unavailable with PID_DISCOVERY_FAILED reason.
        for pid_hex in CONFIGURED_EXTENDED_PIDS:
            unit = EXTENDED_PID_UNITS.get(pid_hex, "")
            result = {
                "pid": pid_hex,
                "value": None,
                "unit": unit,
                "supported": False,
                "available": False,
                "rawResponse": None,
                "reason": "PID_DISCOVERY_FAILED",
            }
            extended_results[pid_hex] = result
            _debug(f"read_vehicle_health extended pid={pid_hex} discovery_failed")

    # -----------------------------------------------------------------------
    # Build result map — standard health PIDs
    # -----------------------------------------------------------------------

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
        vehicle_health[field_name] = results.get(
            pid, _unsupported_pid_result(pid, _get_unit_for_pid(pid))
        )

    vehicle_health["supportedHealthPids"] = supported_pids
    vehicle_health["unsupportedHealthPids"] = unsupported_pids

    # -----------------------------------------------------------------------
    # Build result map — extended PIDs
    # -----------------------------------------------------------------------
    # No top-level metadata fields (extendedPidsDiscoveryFailed,
    # supportedExtendedPids, unsupportedExtendedPids). Discovery state
    # lives inside each PID result's `reason` field.

    for pid_hex, field_name in _EXTENDED_PID_FIELD_MAP.items():
        vehicle_health[field_name] = extended_results.get(
            pid_hex,
            _unsupported_pid_result(pid_hex, EXTENDED_PID_UNITS.get(pid_hex, "")),
        )

    _debug(f"read_vehicle_health final={vehicle_health!r}")
    return vehicle_health