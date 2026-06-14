from src.agent.bootstrap import configure_agent_auth, create_obd_adapter, ensure_adapter_connected
from src.agent.command_dispatcher import poll_scan_queue
from src.agent.event_publisher import emit_scan_event as _emit
from src.agent.event_publisher import emit_session_event as _emit_session
from src.agent.scan_executor import (
    execute_clear_dtc,
    execute_scan,
    execute_vehicle_data_read,
)
from src.app import run
from src.obd.elm327 import Elm327Adapter


def main() -> None:
    run()


if __name__ == "__main__":
    main()
