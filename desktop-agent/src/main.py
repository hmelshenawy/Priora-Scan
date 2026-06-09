import argparse
from src.pairing import exchange_pairing_token
from src.api_client import ApiClient
from src.heartbeat import heartbeat_loop
from src.obd.elm327 import Elm327Adapter
from src.obd.commands.vin import read_vin
from src.obd.commands.dtc import read_fault_codes
from src.models.scan_job import ScanJob
from src.models.fault_code import FaultCode
from src.config import (
    AGENT_ACCESS_TOKEN,
    AGENT_ID,
    AGENT_NAME,
    OBD_MOCK,
    SCAN_QUEUE_INTERVAL_SECONDS,
)


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
        if not adapter.is_connected():
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
    if OBD_MOCK:
        from src.obd.mock_adapter import MockObdAdapter

        return MockObdAdapter()
    return Elm327Adapter()


def main() -> None:
    parser = argparse.ArgumentParser(description="PrioraScan Desktop Agent")
    parser.add_argument("--pairing-token", help="12-char pairing token from web UI")
    parser.add_argument("--name", default=AGENT_NAME, help="Agent display name")
    args = parser.parse_args()

    api_client = ApiClient()
    configure_agent_auth(api_client, args)

    adapter = create_obd_adapter()

    import threading

    hb = threading.Thread(
        target=heartbeat_loop,
        args=(
            api_client,
            adapter.is_connected(),
            getattr(adapter, "adapter_type", None),
            getattr(adapter, "protocol", None),
        ),
        daemon=True,
    )
    hb.start()

    while True:
        try:
            poll_scan_queue(api_client, adapter)
        except Exception as e:
            print(f"Scan poll error: {e}")
        import time

        time.sleep(SCAN_QUEUE_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
