"""Live data command-queue probe.

The backend exposes ``GET /api/v1/obd/agents/:id/live-data/command-queue``
which returns at most one pending command and marks it consumed. The
agent's main loop calls :func:`poll_live_data_command_queue` on a
short interval (same cadence as the scan queue) to:

* Start a :class:`LiveDataPoller` when a ``LIVE_DATA_POLL`` command
  arrives.
* Stop the active poller when a ``LIVE_DATA_STOP`` command arrives.
* Trigger a one-shot vehicle data read when a ``READ_VEHICLE_DATA``
  command arrives (Feature 009 Phase A).
* Trigger a DTC clear when a ``CLEAR_DTC`` command arrives
  (Feature 009 Phase B).

The function is idempotent: a repeated ``LIVE_DATA_POLL`` for the
same session replaces the existing poller; a ``LIVE_DATA_STOP`` with
no active poller is a no-op.

``READ_VEHICLE_DATA`` and ``CLEAR_DTC`` are dispatched to handler
functions that will be implemented in Phase 2. For now, the dispatch
routes these commands and logs a placeholder message so the agent
does not silently ignore them.
"""

from __future__ import annotations

from typing import Callable, Optional

from src.api_client import ApiClient
from src.live_data.poller import LiveDataPoller

# Handler callbacks for Feature 009 commands.
# Set by main.py during agent startup after all modules are imported.
# This avoids circular imports and allows Phase 2 to wire the real handlers.
_vehicle_data_read_handler: Optional[Callable] = None
_clear_dtc_handler: Optional[Callable] = None


def set_vehicle_data_read_handler(handler: Callable) -> None:
    """Register the handler for READ_VEHICLE_DATA commands."""
    global _vehicle_data_read_handler
    _vehicle_data_read_handler = handler


def set_clear_dtc_handler(handler: Callable) -> None:
    """Register the handler for CLEAR_DTC commands."""
    global _clear_dtc_handler
    _clear_dtc_handler = handler


def _command_path(agent_id: str) -> str:
    return f"/api/v1/obd/agents/{agent_id}/live-data/command-queue"


def poll_live_data_command_queue(
    api_client: ApiClient, poller: LiveDataPoller
) -> None:
    """Drain one pending live-data command for the agent.

    Network failures are swallowed and logged — the main loop will
    call us again on the next tick.
    """

    if not api_client.agent_id:
        return
    try:
        response = api_client.get(_command_path(api_client.agent_id))
    except Exception as exc:  # noqa: BLE001
        print(f"Live data command queue poll failed: {exc}")
        return
    if response is None:
        return
    try:
        payload = response.json()
    except ValueError:
        print(
            "Live data command queue returned non-JSON response: "
            f"status={response.status_code} body={response.text!r}"
        )
        return
    if not payload:
        # Empty array = nothing pending.
        return
    command = payload[0]
    _dispatch(api_client, poller, command)


def _dispatch(
    api_client: ApiClient, poller: LiveDataPoller, command: dict
) -> None:
    command_type = command.get("commandType")
    session_id: Optional[str] = command.get("liveDataSessionId")
    # Feature 009 commands carry diagnosticSessionId in payload
    # since they are not tied to a LiveDataSession.
    if not session_id:
        payload = command.get("payload") or {}
        session_id = payload.get("diagnosticSessionId") or payload.get("sessionId")
    if command_type == "LIVE_DATA_POLL":
        cmd_payload = command.get("payload") or {}
        if not session_id:
            print("LIVE_DATA_POLL command missing liveDataSessionId; ignoring")
            return
        cadence_ms = int(cmd_payload.get("cadenceMs") or 1000)
        pids = list(cmd_payload.get("pids") or [])
        poller.start(session_id, cadence_ms, pids)
    elif command_type == "LIVE_DATA_STOP":
        poller.stop()
    elif command_type == "READ_VEHICLE_DATA":
        if not session_id:
            print("READ_VEHICLE_DATA command missing liveDataSessionId; ignoring")
            return
        if _vehicle_data_read_handler is not None:
            _vehicle_data_read_handler(api_client, session_id)
        else:
            print(
                "READ_VEHICLE_DATA received but no handler registered; "
                "vehicle data read will be implemented in Phase 2"
            )
    elif command_type == "CLEAR_DTC":
        if not session_id:
            print("CLEAR_DTC command missing liveDataSessionId; ignoring")
            return
        if _clear_dtc_handler is not None:
            _clear_dtc_handler(api_client, session_id)
        else:
            print(
                "CLEAR_DTC received but no handler registered; "
                "DTC clear will be implemented in Phase 2"
            )
    else:
        print(f"Unknown live data command type: {command_type!r}")
