import argparse
from src.pairing import exchange_pairing_token
from src.api_client import ApiClient
from src.heartbeat import heartbeat_loop
from src.obd.elm327 import Elm327Adapter
from src.obd.commands.vin import read_vin
from src.obd.commands.dtc import read_fault_codes
from src.models.scan_job import ScanJob
from src.models.fault_code import FaultCode
from src.config import SCAN_QUEUE_INTERVAL_SECONDS


def poll_scan_queue(api_client: ApiClient, adapter: Elm327Adapter) -> None:
    response = api_client.get(f"/obd/agents/{api_client.agent_id}/scan-queue")
    if not response:
        return
    jobs = response.json()
    for job in jobs:
        scan_job = ScanJob.from_api(job)
        execute_scan(api_client, adapter, scan_job)


def execute_scan(api_client: ApiClient, adapter: Elm327Adapter, job: ScanJob) -> None:
    try:
        if not adapter.is_connected():
            _emit(api_client, job.id, "ADAPTER_ERROR", {"message": "No adapter connected"})
            return

        _emit(api_client, job.id, "ADAPTER_READY", {"protocol": adapter.protocol})

        vin = read_vin(adapter)
        _emit(api_client, job.id, "VIN_READ", {"vin": vin})

        fault_codes = read_fault_codes(adapter)
        _emit(api_client, job.id, "SCAN_COMPLETE", {"faultCodes": [fc.to_dict() for fc in fault_codes]})
    except Exception as e:
        _emit(api_client, job.id, "SCAN_ERROR", {"message": str(e)})


def _emit(api_client: ApiClient, scan_id: str, event_type: str, data: dict) -> None:
    api_client.post(
        f"/obd/agents/{api_client.agent_id}/scan-events",
        json={"scanId": scan_id, "eventType": event_type, "data": data},
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="PrioraScan Desktop Agent")
    parser.add_argument("--pairing-token", required=True, help="12-char pairing token from web UI")
    parser.add_argument("--name", default="Desktop Agent", help="Agent display name")
    args = parser.parse_args()

    api_client = ApiClient()
    exchange_pairing_token(api_client, args.pairing_token, args.name)
    print(f"Paired agent: {api_client.agent_id}")

    adapter = Elm327Adapter()

    import threading

    hb = threading.Thread(target=heartbeat_loop, args=(api_client, adapter.is_connected()), daemon=True)
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
