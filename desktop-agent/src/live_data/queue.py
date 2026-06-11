"""Live data command-queue probe.

The backend exposes ``GET /api/v1/obd/agents/:id/live-data/command-queue``
which returns at most one pending command and marks it consumed. The
agent's main loop calls :func:`poll_live_data_command_queue` on a
short interval (same cadence as the scan queue) to:

* Start a :class:`LiveDataPoller` when a ``LIVE_DATA_POLL`` command
  arrives.
* Stop the active poller when a ``LIVE_DATA_STOP`` command arrives.

The function is idempotent: a repeated ``LIVE_DATA_POLL`` for the
same session replaces the existing poller; a ``LIVE_DATA_STOP`` with
no active poller is a no-op.
"""

from __future__ import annotations

from typing import Optional

from src.api_client import ApiClient
from src.live_data.poller import LiveDataPoller


def _command_path(agent_id: str) -> str:
    return f"/obd/agents/{agent_id}/live-data/command-queue"


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
    else:
        print(f"Unknown live data command type: {command_type!r}")
