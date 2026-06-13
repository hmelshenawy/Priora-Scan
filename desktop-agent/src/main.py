import argparse
from src.pairing import exchange_pairing_token
from src.api_client import ApiClient
from src.heartbeat import heartbeat_loop
from src.live_data.poller import LiveDataPoller
from src.live_data.queue import (
    poll_live_data_command_queue,
    set_vehicle_data_read_handler,
    set_clear_dtc_handler,
)
from src.obd.elm327 import Elm327Adapter
from src.obd.commands.vin import read_vin
from src.obd.commands.dtc import read_fault_codes
from src.obd.commands.vehicle_data import (
    read_battery_voltage,
    read_fuel_system_status,
    read_engine_load,
    read_fuel_level,
    read_readiness_monitors,
    read_supported_pids,
    read_mileage,
)
from src.obd.commands.clear_dtc import clear_dtc
from src.models.scan_job import ScanJob
from src.models.fault_code import FaultCode
from src.config import (
    AGENT_ACCESS_TOKEN,
    AGENT_ID,
    AGENT_NAME,
    OBD_ADAPTER_TYPE,
    SCAN_QUEUE_INTERVAL_SECONDS,
)


def ensure_adapter_connected(adapter) -> bool:
    """Return True when the adapter is connected, attempting connect() if needed."""
    try:
        if adapter.is_connected():
            return True
    except Exception:
        pass

    connect = getattr(adapter, "connect", None)
    if not callable(connect):
        return False

    try:
        return bool(connect())
    except Exception as e:
        print(f"Adapter connection failed: {e}")
        return False


def poll_scan_queue(api_client: ApiClient, adapter: Elm327Adapter) -> None:
    response = api_client.get(f"/obd/agents/{api_client.agent_id}/scan-queue")
    if not response:
        return
    try:
        jobs = response.json()
    except ValueError:
        print(
            "Scan queue returned non-JSON response: "
            f"status={response.status_code} body={response.text!r}"
        )
        return
    for job in jobs:
        scan_job = ScanJob.from_api(job)
        execute_scan(api_client, adapter, scan_job)


def execute_scan(api_client: ApiClient, adapter: Elm327Adapter, job: ScanJob) -> None:
    try:
        if not ensure_adapter_connected(adapter):
            _emit(api_client, job.id, "ERROR", {"message": "No adapter connected"})
            return

        _emit(api_client, job.id, "ADAPTER_CONNECTED", {"protocol": adapter.protocol})

        if not job.vin:
            vin = read_vin(adapter)
            vin_result = _emit(api_client, job.id, "VIN_READ", {"vin": vin})
            print(f"VIN detected: {vin}")
            if vin_result and vin_result.get("status") == "NEEDS_VEHICLE_CONFIRMATION":
                print("Vehicle confirmation required")
                return

        fault_codes = read_fault_codes(adapter)
        _emit(api_client, job.id, "DTC_READ", {"codes": [fc.to_dict() for fc in fault_codes]})
    except Exception as e:
        _emit(api_client, job.id, "ERROR", {"message": str(e)})


def _emit(api_client: ApiClient, scan_id: str, event_type: str, data: dict) -> None:
    response = api_client.post(
        f"/obd/agents/{api_client.agent_id}/scan-events",
        json={"scanJobId": scan_id, "event": event_type, "payload": data},
    )
    return response.json() if response else None


def _emit_session(api_client: ApiClient, session_id: str, event_type: str, data: dict) -> None:
    """Emit an event using sessionId instead of scanJobId (Feature 009)."""
    response = api_client.post(
        f"/obd/agents/{api_client.agent_id}/scan-events",
        json={"sessionId": session_id, "event": event_type, "payload": data},
    )
    return response.json() if response else None


def execute_vehicle_data_read(api_client: ApiClient, session_id: str, adapter) -> None:
    """Read all vehicle data PIDs and emit VEHICLE_DATA_READ event.

    Feature 009 Phase A: one-shot read of battery voltage, fuel
    system status, engine load, fuel level, readiness monitors,
    supported PIDs, and mileage. Unsupported PIDs are reported as
    ``{ value: null, supported: false }`` rather than raising.
    """
    if not ensure_adapter_connected(adapter):
        _emit_session(api_client, session_id, "ERROR", {"message": "No adapter connected"})
        return

    vehicle_data = {
        "batteryVoltage": read_battery_voltage(adapter),
        "fuelSystemStatus": read_fuel_system_status(adapter),
        "calculatedEngineLoad": read_engine_load(adapter),
        "fuelLevel": read_fuel_level(adapter),
        "readinessMonitors": read_readiness_monitors(adapter),
        "supportedPids": read_supported_pids(adapter),
        "mileage": read_mileage(adapter),
    }

    # Also include VIN confirmation (PID 09 02)
    try:
        vin = read_vin(adapter)
        vehicle_data["vin"] = {"value": vin, "supported": True}
    except Exception:
        vehicle_data["vin"] = {"value": None, "supported": False}

    _emit_session(api_client, session_id, "VEHICLE_DATA_READ", {"vehicleData": vehicle_data})
    print(f"Vehicle data read completed for session {session_id}")


def execute_clear_dtc(api_client: ApiClient, session_id: str, adapter) -> None:
    """Send Mode 04 clear DTC and emit DTC_CLEARED or DTC_CLEAR_FAILED event.

    Feature 009 Phase B: safe clearing of fault codes.
    """
    if not ensure_adapter_connected(adapter):
        _emit_session(api_client, session_id, "DTC_CLEAR_FAILED", {"reason": "No adapter connected"})
        return

    result = clear_dtc(adapter)

    if result["success"]:
        _emit_session(api_client, session_id, "DTC_CLEARED", {"success": True})
        print(f"DTC clear succeeded for session {session_id}")
    else:
        reason = result.get("reason", "Unknown failure")
        _emit_session(api_client, session_id, "DTC_CLEAR_FAILED", {"reason": reason})
        print(f"DTC clear failed for session {session_id}: {reason}")


def configure_agent_auth(api_client: ApiClient, args) -> None:
    if AGENT_ACCESS_TOKEN:
        if not AGENT_ID:
            raise RuntimeError("Saved agent token found but AGENT_ID is missing")
        api_client.set_agent_token(AGENT_ID, AGENT_ACCESS_TOKEN)
        print("Using saved agent token")
        return

    print("No saved token found; pairing token required")
    if not args.pairing_token:
        raise SystemExit("--pairing-token is required for first pairing")

    exchange_pairing_token(api_client, args.pairing_token, args.name)
    print(f"Paired agent: {api_client.agent_id}")


def create_obd_adapter():
    if OBD_ADAPTER_TYPE == "mock":
        from src.obd.mock_adapter import MockObdAdapter

        return MockObdAdapter()
    if OBD_ADAPTER_TYPE == "wifi":
        from src.obd.wifi_elm327 import WifiElm327Adapter

        return WifiElm327Adapter()
    return Elm327Adapter()


def main() -> None:
    parser = argparse.ArgumentParser(description="PrioraScan Desktop Agent")
    parser.add_argument("--pairing-token", help="12-char pairing token from web UI")
    parser.add_argument("--name", default=AGENT_NAME, help="Agent display name")
    args = parser.parse_args()

    api_client = ApiClient()
    configure_agent_auth(api_client, args)

    adapter = create_obd_adapter()
    if ensure_adapter_connected(adapter):
        print(
            "Adapter connected: "
            f"{getattr(adapter, 'adapter_type', 'UNKNOWN')} "
            f"({getattr(adapter, 'protocol', 'UNKNOWN')})"
        )
    else:
        print("Adapter not connected; the agent will retry when commands arrive")

    # Register Feature 009 command handlers with the queue dispatcher.
    # Closures capture the adapter instance so the handlers don't need
    # to recreate or import it (avoids circular imports).
    set_vehicle_data_read_handler(
        lambda api_client, session_id: execute_vehicle_data_read(api_client, session_id, adapter)
    )
    set_clear_dtc_handler(
        lambda api_client, session_id: execute_clear_dtc(api_client, session_id, adapter)
    )

    import threading

    hb = threading.Thread(
        target=heartbeat_loop,
        args=(api_client, adapter),
        daemon=True,
    )
    hb.start()

    live_data_poller = LiveDataPoller(api_client, api_client.agent_id)

    while True:
        try:
            poll_scan_queue(api_client, adapter)
        except Exception as e:
            print(f"Scan poll error: {e}")
        try:
            poll_live_data_command_queue(api_client, live_data_poller)
        except Exception as e:
            print(f"Live data command queue error: {e}")
        import time

        time.sleep(SCAN_QUEUE_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
