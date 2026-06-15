"""Compatibility facade for vehicle data command readers.

The implementation is split across focused modules. Existing imports from
``src.obd.commands.vehicle_data`` are preserved here.
"""

from src.obd.commands.health_pids import (
    CONFIGURED_HEALTH_PIDS,
    _get_unit_for_pid,
    _health_pid_result,
    _parse_bytes,
    _send_pid,
    _unavailable_pid_result,
    _unsupported_pid_result,
    _unsupported_point,
    read_battery_voltage,
    read_coolant_temperature,
    read_engine_load,
    read_fuel_level,
    read_fuel_system_status,
    read_mileage,
    read_rpm,
    read_vehicle_speed,
)
from src.obd.commands.readiness import (
    _MONITOR_NAMES,
    parse_readiness_monitors,
    read_readiness_monitors,
)
from src.obd.commands.freeze_frame import parse_freeze_frame, read_freeze_frame
from src.obd.commands.supported_pids import _parse_bitmap, read_supported_pids
from src.obd.commands.vehicle_health import read_vehicle_health
