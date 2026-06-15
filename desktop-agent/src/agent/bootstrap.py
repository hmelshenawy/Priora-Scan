from src.api_client import ApiClient
from src.config import AGENT_ACCESS_TOKEN, AGENT_ID, OBD_ADAPTER_TYPE
from src.obd.usb_elm327 import Elm327Adapter
from src.pairing import exchange_pairing_token


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
