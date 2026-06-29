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
from src.obd.adapter_lock import adapter_command_lock
from src.obd.commands.elm_parser import compact_raw_response, is_adapter_error_response


def _debug(message: str) -> None:
    print(f"[LIVE_DATA_DEBUG] {message}")


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

    def __init__(self, api_client: ApiClient, agent_id: str, adapter=None):
        self._api = api_client
        self._agent_id = agent_id
        self._adapter = adapter
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
        _debug(
            "configured PIDs from backend: "
            + repr(
                [
                    {
                        "shortName": p.get("shortName"),
                        "namespace": p.get("namespace"),
                        "mode": p.get("mode"),
                        "pid": p.get("pid"),
                    }
                    for p in pids
                ]
            )
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
        readings = self._build_readings()
        if not readings:
            _debug("no live data readings produced for this tick")
            return True
        payload = {"readings": readings}
        _debug(f"payload posted to backend: {payload!r}")
        try:
            response = self._api.post(
                f"/api/v1/obd/agents/{self._agent_id}/live-data/{self._session_id}/poll-result",
                json=payload,
            )
        except Exception as exc:  # noqa: BLE001
            # 404 = session was deleted or stopped; any other HTTP
            # error is treated as transient and the loop keeps going.
            status = getattr(getattr(exc, "response", None), "status_code", None)
            body = getattr(getattr(exc, "response", None), "text", "")
            _debug(f"backend poll-result error status={status!r} body={body!r} error={exc!r}")
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
            _debug(
                f"backend poll-result response status={response.status_code} "
                f"body={response.text!r}"
            )
            print(
                f"Live data poll POST returned {response.status_code}: "
                f"{response.text}"
            )
            if response.status_code in (404, 409):
                return False
        elif response is not None:
            _debug(
                f"backend poll-result response status={response.status_code} "
                f"body={getattr(response, 'text', '')!r}"
            )
        return True

    def _build_readings(self) -> list[dict]:
        if self._uses_real_adapter():
            return self._read_adapter_readings()

        readings = self._generator.tick() if self._generator else []
        for reading in readings:
            decoded = _decode_preview(reading["mode"], reading["pid"], reading["rawValue"])
            _debug(
                "mock/generated live data "
                f"{reading['shortName']} command={reading['mode']}{reading['pid']} "
                f"rawValue={reading['rawValue']!r} decoded={decoded!r}"
            )
        return readings

    def _uses_real_adapter(self) -> bool:
        adapter_type = getattr(self._adapter, "adapter_type", None)
        return self._adapter is not None and adapter_type not in (None, "MOCK")

    def _read_adapter_readings(self) -> list[dict]:
        with adapter_command_lock(self._adapter):
            return self._read_adapter_readings_locked()

    def _read_adapter_readings_locked(self) -> list[dict]:
        readings: list[dict] = []
        assert self._generator is not None

        for descriptor in self._generator.descriptors():
            command = f"{descriptor.mode}{descriptor.pid}".upper()
            _debug(
                f"sending PID command shortName={descriptor.short_name!r} command={command}"
            )
            raw = b""
            cleaned = ""
            raw_value = ""
            decoded = None
            try:
                raw = self._adapter.send(command)
                cleaned = compact_raw_response(raw, command=command)
                raw_value = _extract_pid_payload(
                    cleaned,
                    descriptor.mode,
                    descriptor.pid,
                )
                decoded = _decode_preview(descriptor.mode, descriptor.pid, raw_value)
            except Exception as exc:  # noqa: BLE001 - keep remaining PIDs flowing
                _debug(
                    f"PID command failed shortName={descriptor.short_name!r} "
                    f"command={command} raw={raw!r} cleaned={cleaned!r} error={exc!r}"
                )
                raw_value = ""
            else:
                _debug(
                    f"PID response shortName={descriptor.short_name!r} command={command} "
                    f"raw={raw!r} cleaned={cleaned!r} rawValue={raw_value!r} "
                    f"decoded={decoded!r}"
                )

            readings.append(
                {
                    "shortName": descriptor.short_name,
                    "namespace": descriptor.namespace,
                    "mode": descriptor.mode,
                    "pid": descriptor.pid,
                    "rawValue": raw_value,
                }
            )

        return readings


def _extract_pid_payload(cleaned: str, mode: str, pid: str) -> str:
    compact = (cleaned or "").replace(" ", "").upper()
    if not compact or is_adapter_error_response(compact):
        return ""
    if len(compact) % 2 != 0:
        return ""
    try:
        bytes.fromhex(compact)
    except ValueError:
        return ""

    response_prefix = f"{int(mode, 16) + 0x40:02X}{pid.upper()}"
    if compact.startswith(response_prefix):
        compact = compact[len(response_prefix):]
    elif mode.upper() == "01" and compact.startswith("41"):
        compact = compact[2:]

    return " ".join(compact[i:i + 2] for i in range(0, len(compact), 2))


def _decode_preview(mode: str, pid: str, raw_value: str):
    if mode.upper() != "01" or not raw_value:
        return None
    try:
        data = bytes.fromhex(raw_value)
    except ValueError:
        return None
    if not data:
        return None

    pid = pid.upper()
    a = data[0]
    b = data[1] if len(data) > 1 else 0
    if pid == "0C" and len(data) >= 2:
        return {"value": ((a * 256) + b) / 4, "unit": "rpm"}
    if pid == "0D":
        return {"value": a, "unit": "km/h"}
    if pid == "05":
        return {"value": a - 40, "unit": "°C"}
    if pid == "04":
        return {"value": a * 100 / 255, "unit": "%"}
    if pid == "42" and len(data) >= 2:
        return {"value": ((a * 256) + b) / 1000, "unit": "V"}
    if pid == "2F":
        return {"value": a * 100 / 255, "unit": "%"}
    return None
