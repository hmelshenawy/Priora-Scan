from datetime import datetime, timezone

from src.agent.bootstrap import ensure_adapter_connected
from src.agent.event_publisher import emit_scan_event, emit_session_event
from src.api_client import ApiClient
from src.models.scan_job import ScanJob
from src.obd.commands.clear_dtc import clear_dtc
from src.obd.commands.control_unit_discovery import read_control_units
from src.obd.commands.dtc import read_fault_codes
from src.obd.commands.vehicle_data import (
    read_fuel_system_status,
    read_freeze_frame,
    read_mileage,
    read_readiness_monitors,
    read_supported_pids,
    read_vehicle_health,
)
from src.obd.commands.vin import VIN_SUPPORTED, read_vin
from src.obd.adapter_lock import adapter_command_lock
from src.obd.usb_elm327 import Elm327Adapter


def execute_scan(api_client: ApiClient, adapter: Elm327Adapter, job: ScanJob) -> None:
    try:
        with adapter_command_lock(adapter):
            if not ensure_adapter_connected(adapter):
                emit_scan_event(api_client, job.id, "ERROR", {"message": "No adapter connected"})
                return

            emit_scan_event(api_client, job.id, "ADAPTER_CONNECTED", {"protocol": adapter.protocol})

            discovery_session_id = job.diagnostic_session_id
            discovery_completed = False
            if discovery_session_id:
                execute_control_unit_discovery(api_client, discovery_session_id, adapter)
                discovery_completed = True

            if not job.vin and not job.vehicle_id:
                vin_result = read_vin(adapter)
                if vin_result.status == VIN_SUPPORTED:
                    vin_emit_result = emit_scan_event(
                        api_client, job.id, "VIN_READ", {"vin": vin_result.vin}
                    )
                    print(f"VIN detected: {vin_result.vin}")
                    if vin_emit_result and vin_emit_result.get("sessionId"):
                        discovery_session_id = vin_emit_result.get("sessionId")
                        execute_control_unit_discovery(api_client, discovery_session_id, adapter)
                        discovery_completed = True
                    if (
                        vin_emit_result
                        and vin_emit_result.get("status") == "NEEDS_VEHICLE_CONFIRMATION"
                    ):
                        print("Vehicle confirmation required")
                        return
                else:
                    emit_scan_event(
                        api_client,
                        job.id,
                        "VIN_READ",
                        {
                            "vin": None,
                            "supported": False,
                            "vinStatus": "UNSUPPORTED",
                            "reason": vin_result.reason,
                        },
                    )
                    print(f"VIN not supported: {vin_result.reason}")

            if not discovery_completed:
                print("Control unit discovery skipped: missing session id")

            fault_codes = read_fault_codes(adapter)
            emit_scan_event(
                api_client, job.id, "DTC_READ", {"codes": [fc.to_dict() for fc in fault_codes]}
            )
    except Exception as e:
        emit_scan_event(api_client, job.id, "ERROR", {"message": str(e)})


def execute_vehicle_data_read(api_client: ApiClient, session_id: str, adapter) -> None:
    """Read vehicle health data and emit VEHICLE_DATA_READ event."""
    try:
        with adapter_command_lock(adapter):
            if not ensure_adapter_connected(adapter):
                emit_session_event(api_client, session_id, "ERROR", {"message": "No adapter connected"})
                return

            vehicle_health = read_vehicle_health(adapter)

            vehicle_health["fuelSystemStatus"] = read_fuel_system_status(adapter)
            vehicle_health["readinessMonitors"] = read_readiness_monitors(adapter)
            vehicle_health["freezeFrame"] = read_freeze_frame(adapter)
            vehicle_health["supportedPids"] = read_supported_pids(adapter)
            vehicle_health["mileage"] = read_mileage(adapter)

            vin_result = read_vin(adapter)
            vehicle_health["vin"] = {
                "value": vin_result.vin,
                "supported": vin_result.status == VIN_SUPPORTED,
            }
            if vin_result.status != VIN_SUPPORTED and vin_result.reason:
                vehicle_health["vin"]["reason"] = vin_result.reason

        emit_session_event(api_client, session_id, "VEHICLE_DATA_READ", {"vehicleData": vehicle_health})
        print(f"Vehicle data read completed for session {session_id}")
    except Exception as e:
        emit_session_event(api_client, session_id, "ERROR", {"message": str(e)})
        print(f"Vehicle data read failed for session {session_id}: {e}")


def execute_clear_dtc(api_client: ApiClient, session_id: str, adapter) -> None:
    """Send Mode 04 clear DTC and emit DTC_CLEARED or DTC_CLEAR_FAILED event."""
    with adapter_command_lock(adapter):
        if not ensure_adapter_connected(adapter):
            emit_session_event(
                api_client, session_id, "DTC_CLEAR_FAILED", {"reason": "No adapter connected"}
            )
            return

        result = clear_dtc(adapter)

    if result["success"]:
        emit_session_event(api_client, session_id, "DTC_CLEARED", {"success": True})
        print(f"DTC clear succeeded for session {session_id}")
    else:
        reason = result.get("reason", "Unknown failure")
        emit_session_event(api_client, session_id, "DTC_CLEAR_FAILED", {"reason": reason})
        print(f"DTC clear failed for session {session_id}: {reason}")


def execute_control_unit_discovery(api_client: ApiClient, session_id: str, adapter) -> None:
    """Run control unit discovery and emit CONTROL_UNIT_DISCOVERY_READ event.

    This is a scan-level operation that runs automatically as part of the
    diagnostic scan workflow. It is NOT triggered by a live data command.

    Each probe is isolated — a single probe failure produces an ERROR result
    and the scan continues with remaining probes. Partial results are always
    persisted. Only unrecoverable startup failures prevent execution.
    """
    try:
        if not ensure_adapter_connected(adapter):
            # Unrecoverable: adapter never connected — cannot discover
            print(f"Control unit discovery skipped for session {session_id}: no adapter")
            return

        discovery_result = read_control_units(adapter)

        print(
            "Scan event CONTROL_UNIT_DISCOVERY_READ: "
            f"{discovery_result.get('summary', {}).get('respondersFound', 0)} responders found"
        )
        emit_session_event(
            api_client,
            session_id,
            "CONTROL_UNIT_DISCOVERY_READ",
            {"controlUnitDiscovery": discovery_result},
        )
        print(f"Control unit discovery completed for session {session_id}: "
              f"{discovery_result.get('summary', {}).get('respondersFound', 0)} responders found")

    except Exception as e:
        # Discovery never crashes the session. If we get here, it's an
        # unrecoverable error that prevents even starting the scan.
        # Emit an error event so the backend knows discovery didn't run.
        print(f"Control unit discovery failed for session {session_id}: {e}")
        emit_session_event(
            api_client,
            session_id,
            "CONTROL_UNIT_DISCOVERY_READ",
            {
                "controlUnitDiscovery": {
                    "version": 1,
                    "strategy": "GENERIC_OBD_CAN",
                    "scanMode": "FUNCTIONAL_THEN_PHYSICAL",
                    "probeSequence": ["22F190"],
                    "startedAt": datetime.now(timezone.utc).isoformat(),
                    "completedAt": datetime.now(timezone.utc).isoformat(),
                    "summary": {
                        "totalProbes": 0,
                        "respondersFound": 0,
                        "functionalResponders": 0,
                        "physicalResponders": 0,
                    },
                    "probes": [],
                    "responders": [],
                }
            },
        )
