import argparse
import threading
import time

from src.agent.bootstrap import configure_agent_auth, create_obd_adapter, ensure_adapter_connected
from src.agent.command_dispatcher import poll_scan_queue
from src.agent.scan_executor import execute_clear_dtc, execute_vehicle_data_read
from src.api_client import ApiClient
from src.config import AGENT_NAME, SCAN_QUEUE_INTERVAL_SECONDS
from src.heartbeat import heartbeat_loop
from src.live_data.poller import LiveDataPoller
from src.live_data.queue import (
    poll_live_data_command_queue,
    set_clear_dtc_handler,
    set_vehicle_data_read_handler,
)


def run() -> None:
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

    set_vehicle_data_read_handler(
        lambda api_client, session_id: execute_vehicle_data_read(api_client, session_id, adapter)
    )
    set_clear_dtc_handler(
        lambda api_client, session_id: execute_clear_dtc(api_client, session_id, adapter)
    )

    hb = threading.Thread(
        target=heartbeat_loop,
        args=(api_client, adapter),
        daemon=True,
    )
    hb.start()

    live_data_poller = LiveDataPoller(api_client, api_client.agent_id, adapter=adapter)

    while True:
        try:
            poll_scan_queue(api_client, adapter)
        except Exception as e:
            print(f"Scan poll error: {e}")
        try:
            poll_live_data_command_queue(api_client, live_data_poller)
        except Exception as e:
            print(f"Live data command queue error: {e}")

        time.sleep(SCAN_QUEUE_INTERVAL_SECONDS)
