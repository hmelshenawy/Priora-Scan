"""Background poller for LIVE_DATA_POLL commands.

The poller is owned by the agent's main loop. ``start`` spins up a
daemon thread that ticks every ``cadenceMs`` until :meth:`stop` is
called, the backend emits a ``LIVE_DATA_STOP`` command, or the
backend returns 404 (the session was deleted from another path).

The poller never raises into the main loop — every exception is
logged and swallowed so a transient backend blip does not kill the
agent.
"""

from __future__ import annotations

import threading
import time
from typing import Optional

from src.api_client import ApiClient
from src.live_data.generator import MockLiveDataGenerator


def _clamp_cadence(cadence_ms: int) -> int:
    """Match the backend's clamp: 200ms ≤ cadence ≤ 5000ms."""

    if cadence_ms is None or cadence_ms <= 0:
        return 1000
    if cadence_ms < 200:
        return 200
    if cadence_ms > 5000:
        return 5000
    return cadence_ms


class LiveDataPoller:
    """Background poll thread for a single LiveDataSession.

    Lifecycle:

    1. Backend emits ``LIVE_DATA_POLL`` → main loop calls
       :meth:`start` with the payload.
    2. A daemon thread is started that calls :meth:`_tick` every
       ``cadenceMs`` milliseconds.
    3. The thread exits when :meth:`stop` is called, the backend
       emits ``LIVE_DATA_STOP`` (signalled via
       :meth:`request_stop`), or the session is 404'd on the
       backend.
    """

    def __init__(self, api_client: ApiClient, agent_id: str):
        self._api = api_client
        self._agent_id = agent_id
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._session_id: Optional[str] = None
        self._cadence_ms: int = 1000
        self._generator: Optional[MockLiveDataGenerator] = None

    @property
    def session_id(self) -> Optional[str]:
        return self._session_id

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self, live_data_session_id: str, cadence_ms: int, pids: list[dict]) -> None:
        """Start (or replace) the poll loop for a session."""

        if self.is_running:
            self.stop()

        self._session_id = live_data_session_id
        self._cadence_ms = _clamp_cadence(cadence_ms)
        self._generator = MockLiveDataGenerator(pids=pids)
        self._stop_event = threading.Event()

        self._thread = threading.Thread(
            target=self._run,
            name=f"live-data-poller-{live_data_session_id}",
            daemon=True,
        )
        self._thread.start()
        print(
            f"Live data poller started for session {live_data_session_id} "
            f"(cadence {self._cadence_ms}ms, {len(pids)} PIDs)"
        )

    def request_stop(self) -> None:
        """Signal the background thread to exit on its next tick."""

        self._stop_event.set()

    def stop(self) -> None:
        """Synchronously stop the poller and join the thread."""

        self._stop_event.set()
        thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=2.0)
        self._thread = None
        self._session_id = None
        self._generator = None

    # -- internal --------------------------------------------------------

    def _run(self) -> None:
        cadence_seconds = self._cadence_ms / 1000.0
        # First tick fires immediately so the dashboard shows values
        # within one RTT of the user pressing Start.
        while not self._stop_event.is_set():
            try:
                keep_going = self._tick()
            except Exception as exc:  # noqa: BLE001 - log & keep going
                print(f"Live data tick failed: {exc}")
                keep_going = True
            if not keep_going:
                break
            # Sleep in small slices so stop() returns quickly.
            slept = 0.0
            slice_ = 0.05
            while slept < cadence_seconds and not self._stop_event.is_set():
                time.sleep(min(slice_, cadence_seconds - slept))
                slept += slice_

    def _tick(self) -> bool:
        """Run one poll cycle. Return False to stop the loop."""

        if not self._session_id or not self._generator:
            return False
        readings = self._generator.tick()
        if not readings:
            return True
        try:
            response = self._api.post(
                f"/obd/agents/{self._agent_id}/live-data/{self._session_id}/poll-result",
                json={"readings": readings},
            )
        except Exception as exc:  # noqa: BLE001
            # 404 = session was deleted or stopped; any other HTTP
            # error is treated as transient and the loop keeps going.
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status == 404:
                print(
                    f"Live data session {self._session_id} no longer exists; "
                    "stopping poller."
                )
                return False
            print(f"Live data poll POST failed (will retry): {exc}")
            return True

        # Successful POST — keep going unless the backend explicitly
        # tells us to stop (it does so by flipping the session's
        # status to STOPPED, which would cause ingestPollResult to
        # return 409 LIVE_DATA_SESSION_NOT_ACTIVE). That is surfaced
        # as a non-2xx status in the response.
        if response is not None and response.status_code >= 400:
            print(
                f"Live data poll POST returned {response.status_code}: "
                f"{response.text}"
            )
            if response.status_code in (404, 409):
                return False
        return True
