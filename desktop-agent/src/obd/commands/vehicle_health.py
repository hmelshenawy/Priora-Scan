"""Vehicle health orchestration across configured health PIDs."""

from __future__ import annotations

from typing import Any, Dict

from src.obd.adapter import BaseAdapter
from src.obd.commands.health_pids import (
    CONFIGURED_HEALTH_PIDS,
    _debug,
    _get_unit_for_pid,
    _unavailable_pid_result,
    _unsupported_pid_result,
)
from src.obd.commands.supported_pids import read_supported_pids


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

    _debug(f"read_vehicle_health final={vehicle_health!r}")
    return vehicle_health
