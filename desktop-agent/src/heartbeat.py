import time
from src.api_client import ApiClient
from src.config import AGENT_VERSION


def send_heartbeat(
    api_client: ApiClient, adapter_connected: bool, adapter_type: str = None, protocol: str = None
):
    response = api_client.post(
        f"/obd/agents/{api_client.agent_id}/heartbeat",
        json={
            "version": AGENT_VERSION,
            "adapterConnected": adapter_connected,
            "adapterType": adapter_type,
            "protocol": protocol,
        },
    )
    return response.json() if response else None


def heartbeat_loop(
    api_client: ApiClient,
    adapter_connected: bool,
    adapter_type: str = None,
    protocol: str = None,
    interval: int = 30,
):
    while True:
        try:
            send_heartbeat(api_client, adapter_connected, adapter_type, protocol)
        except Exception as e:
            print(f"Heartbeat failed: {e}")
        time.sleep(interval)
