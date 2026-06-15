from src.agent.scan_executor import execute_scan
from src.api_client import ApiClient
from src.models.scan_job import ScanJob
from src.obd.usb_elm327 import Elm327Adapter


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
