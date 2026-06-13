import time
from src.api_client import ApiClient
from src.config import AGENT_VERSION


def _derive_connection_type(adapter) -> str:
    """Derive connectionType from adapter_type string.

    Maps: "MOCK" → "MOCK", "ELM327_WIFI" → "WIFI", others → "USB".
    """
    adapter_type = getattr(adapter, "adapter_type", "ELM327")
    if adapter_type == "MOCK":
        return "MOCK"
    if "WIFI" in adapter_type.upper():
        return "WIFI"
    return "USB"


def send_heartbeat(
    api_client: ApiClient,
    adapter_connected: bool,
    adapter_type: str = None,
    connection_type: str = None,
    protocol: str = None,
):
    response = api_client.post(
        f"/obd/agents/{api_client.agent_id}/heartbeat",
        json={
            "version": AGENT_VERSION,
            "adapterConnected": adapter_connected,
            "adapterType": adapter_type,
            "connectionType": connection_type,
            "protocol": protocol,
        },
    )
    return response.json() if response else None


def heartbeat_loop(
    api_client: ApiClient,
    adapter,
    interval: int = 30,
):
    """Send periodic heartbeat with dynamic adapter status.

    Calls adapter.is_connected() each beat to detect WiFi disconnections.
    Derives connectionType from adapter.adapter_type.
    """
    while True:
        try:
            adapter_connected = adapter.is_connected()
            adapter_type = getattr(adapter, "adapter_type", None)
            protocol = getattr(adapter, "protocol", None)
            connection_type = _derive_connection_type(adapter)

            send_heartbeat(
                api_client,
                adapter_connected,
                adapter_type,
                connection_type,
                protocol,
            )
        except Exception as e:
            print(f"Heartbeat failed: {e}")
        time.sleep(interval)