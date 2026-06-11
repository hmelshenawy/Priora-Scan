"""Tests for the Desktop Agent's live data MVP slice."""

from __future__ import annotations

import threading
import time
from typing import Optional

import pytest
from unittest.mock import MagicMock

from src.live_data.generator import MockLiveDataGenerator
from src.live_data.poller import LiveDataPoller, _clamp_cadence
from src.live_data.queue import poll_live_data_command_queue


# ---------------------------------------------------------------------------
# MockLiveDataGenerator
# ---------------------------------------------------------------------------


def _payload_pid(short_name: str, mode: str = "01", pid: str = "0C") -> dict:
    return {"shortName": short_name, "namespace": "STD_OBD2", "mode": mode, "pid": pid}


class TestMockLiveDataGenerator:
    def test_returns_one_reading_per_pid(self):
        gen = MockLiveDataGenerator(
            pids=[_payload_pid("rpm"), _payload_pid("speed"), _payload_pid("coolantTemp")]
        )
        readings = gen.tick()
        assert len(readings) == 3
        assert {r["shortName"] for r in readings} == {"rpm", "speed", "coolantTemp"}

    def test_readings_match_pid_metadata(self):
        gen = MockLiveDataGenerator(pids=[_payload_pid("rpm", "01", "0C")])
        reading = gen.tick()[0]
        assert reading["namespace"] == "STD_OBD2"
        assert reading["mode"] == "01"
        assert reading["pid"] == "0C"
        assert isinstance(reading["rawValue"], str)
        # RPM = (A*256+B)/4, both bytes are space-separated hex.
        a, b = (int(x, 16) for x in reading["rawValue"].split())
        assert 0 <= a <= 0xFF
        assert 0 <= b <= 0xFF
        rpm = (a * 256 + b) / 4
        # Should sit somewhere around 850 ± 10 RPM jitter.
        assert 800 <= rpm <= 900

    def test_speed_is_zero_in_mock(self):
        gen = MockLiveDataGenerator(pids=[_payload_pid("speed", "01", "0D")])
        assert gen.tick()[0]["rawValue"] == "00"

    def test_coolant_temp_is_stable_at_92c(self):
        gen = MockLiveDataGenerator(pids=[_payload_pid("coolantTemp", "01", "05")])
        for _ in range(5):
            assert gen.tick()[0]["rawValue"] == "84"

    def test_battery_voltage_is_two_bytes_around_13_9v(self):
        gen = MockLiveDataGenerator(pids=[_payload_pid("batteryVoltage", "01", "42")])
        raw = gen.tick()[0]["rawValue"]
        a, b = (int(x, 16) for x in raw.split())
        volts = (a * 256 + b) / 1000
        assert 13.8 <= volts <= 14.0

    def test_throttle_position_is_stable_zero(self):
        gen = MockLiveDataGenerator(pids=[_payload_pid("throttlePosition", "01", "11")])
        for _ in range(3):
            assert gen.tick()[0]["rawValue"] == "00"

    def test_engine_load_is_stable(self):
        gen = MockLiveDataGenerator(pids=[_payload_pid("engineLoad", "01", "04")])
        for _ in range(3):
            assert gen.tick()[0]["rawValue"] == "33"

    def test_unknown_short_name_is_skipped(self):
        # Build a generator whose descriptors include an unknown short
        # name; the tick should simply omit it (no crash, no row).
        gen = MockLiveDataGenerator(pids=[_payload_pid("not_a_real_pid")])
        assert gen.tick() == []


# ---------------------------------------------------------------------------
# LiveDataPoller.cadence clamp
# ---------------------------------------------------------------------------


class TestCadenceClamp:
    def test_default_when_none(self):
        assert _clamp_cadence(None) == 1000

    def test_minimum_clamp(self):
        assert _clamp_cadence(50) == 200

    def test_maximum_clamp(self):
        assert _clamp_cadence(10000) == 5000

    def test_passthrough(self):
        assert _clamp_cadence(750) == 750


# ---------------------------------------------------------------------------
# LiveDataPoller behaviour
# ---------------------------------------------------------------------------


class _RecordingClient:
    def __init__(self, status_code: int = 200, fail_with: Optional[Exception] = None):
        self.agent_id = "agent-1"
        self.posts: list[tuple[str, dict]] = []
        self._status_code = status_code
        self._fail_with = fail_with

    def post(self, path: str, json=None):
        self.posts.append((path, json))
        if self._fail_with is not None:
            raise self._fail_with
        resp = MagicMock()
        resp.status_code = self._status_code
        resp.text = ""
        return resp


class TestLiveDataPoller:
    def test_start_posts_to_poll_result_endpoint(self):
        client = _RecordingClient(status_code=200)
        poller = LiveDataPoller(client, agent_id="agent-1")
        try:
            poller.start("live-1", 1000, [_payload_pid("rpm"), _payload_pid("speed")])
            # Wait up to 1s for at least one tick.
            deadline = time.time() + 1.5
            while not client.posts and time.time() < deadline:
                time.sleep(0.05)
            assert client.posts, "Poller should have posted at least once"
            path, body = client.posts[0]
            assert path == "/obd/agents/agent-1/live-data/live-1/poll-result"
            assert "readings" in body
            assert len(body["readings"]) == 2
        finally:
            poller.stop()

    def test_start_replaces_running_session(self):
        client = _RecordingClient()
        poller = LiveDataPoller(client, agent_id="agent-1")
        poller.start("live-1", 1000, [_payload_pid("rpm")])
        time.sleep(0.1)
        first_thread = poller._thread
        poller.start("live-2", 1000, [_payload_pid("rpm")])
        try:
            assert poller._thread is not first_thread
            assert poller.session_id == "live-2"
        finally:
            poller.stop()

    def test_stop_joins_thread_and_clears_session(self):
        client = _RecordingClient()
        poller = LiveDataPoller(client, agent_id="agent-1")
        poller.start("live-1", 500, [_payload_pid("rpm")])
        time.sleep(0.1)
        poller.stop()
        assert poller.session_id is None
        assert poller._thread is None

    def test_404_response_stops_poller(self):
        client = _RecordingClient(status_code=404)
        poller = LiveDataPoller(client, agent_id="agent-1")
        poller.start("live-1", 1000, [_payload_pid("rpm")])
        # Give it a moment to make a request and observe the 404.
        time.sleep(0.5)
        assert poller.is_running is False

    def test_409_response_stops_poller(self):
        client = _RecordingClient(status_code=409)
        poller = LiveDataPoller(client, agent_id="agent-1")
        poller.start("live-1", 1000, [_payload_pid("rpm")])
        time.sleep(0.5)
        assert poller.is_running is False

    def test_request_stop_does_not_join(self):
        client = _RecordingClient()
        poller = LiveDataPoller(client, agent_id="agent-1")
        poller.start("live-1", 1000, [_payload_pid("rpm")])
        poller.request_stop()
        # The thread may still be alive briefly; the call must return
        # synchronously without blocking.
        t0 = time.time()
        poller.request_stop()
        assert time.time() - t0 < 0.2
        poller.stop()  # final cleanup

    def test_transient_error_does_not_stop_poller(self):
        # First call raises a transport error, second call succeeds.
        responses = iter(
            [
                OSError("boom"),
                MagicMock(status_code=200, text=""),
                MagicMock(status_code=200, text=""),
            ]
        )
        client = MagicMock()
        client.agent_id = "agent-1"
        client.post = MagicMock(side_effect=lambda path, json=None: next(responses))
        poller = LiveDataPoller(client, agent_id="agent-1")
        poller.start("live-1", 1000, [_payload_pid("rpm")])
        time.sleep(0.3)
        try:
            assert poller.is_running is True
            assert client.post.call_count >= 1
        finally:
            poller.stop()


# ---------------------------------------------------------------------------
# poll_live_data_command_queue
# ---------------------------------------------------------------------------


class _Command:
    """Lightweight response object with .json() and .text."""

    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload
        self.text = "" if payload is None else str(payload)

    def json(self):
        if self._payload is None:
            raise ValueError("no body")
        return self._payload


class TestCommandQueue:
    def test_starts_poller_on_live_data_poll_command(self):
        poller = LiveDataPoller(MagicMock(agent_id="agent-1"), agent_id="agent-1")
        client = MagicMock()
        client.agent_id = "agent-1"
        client.get = MagicMock(
            return_value=_Command(
                200,
                [
                    {
                        "id": "cmd-1",
                        "commandType": "LIVE_DATA_POLL",
                        "liveDataSessionId": "live-1",
                        "payload": {
                            "cadenceMs": 1000,
                            "pids": [_payload_pid("rpm")],
                        },
                    }
                ],
            )
        )
        try:
            poll_live_data_command_queue(client, poller)
            assert poller.is_running
            assert poller.session_id == "live-1"
        finally:
            poller.stop()

    def test_stops_poller_on_live_data_stop_command(self):
        poller = LiveDataPoller(MagicMock(agent_id="agent-1"), agent_id="agent-1")
        poller.start("live-1", 1000, [_payload_pid("rpm")])
        time.sleep(0.1)

        client = MagicMock()
        client.agent_id = "agent-1"
        client.get = MagicMock(
            return_value=_Command(
                200,
                [
                    {
                        "id": "cmd-2",
                        "commandType": "LIVE_DATA_STOP",
                        "liveDataSessionId": "live-1",
                    }
                ],
            )
        )
        poll_live_data_command_queue(client, poller)
        assert poller.is_running is False
        assert poller.session_id is None

    def test_empty_queue_is_noop(self):
        poller = LiveDataPoller(MagicMock(agent_id="agent-1"), agent_id="agent-1")
        client = MagicMock()
        client.agent_id = "agent-1"
        client.get = MagicMock(return_value=_Command(200, []))
        poll_live_data_command_queue(client, poller)
        assert poller.is_running is False

    def test_get_failure_is_swallowed(self):
        poller = LiveDataPoller(MagicMock(agent_id="agent-1"), agent_id="agent-1")
        client = MagicMock()
        client.agent_id = "agent-1"
        client.get = MagicMock(side_effect=OSError("network down"))
        # Should not raise.
        poll_live_data_command_queue(client, poller)

    def test_non_json_body_is_swallowed(self):
        poller = LiveDataPoller(MagicMock(agent_id="agent-1"), agent_id="agent-1")
        client = MagicMock()
        client.agent_id = "agent-1"
        client.get = MagicMock(return_value=_Command(200, None))
        poll_live_data_command_queue(client, poller)

    def test_unknown_command_type_is_ignored(self):
        poller = LiveDataPoller(MagicMock(agent_id="agent-1"), agent_id="agent-1")
        client = MagicMock()
        client.agent_id = "agent-1"
        client.get = MagicMock(
            return_value=_Command(
                200,
                [
                    {
                        "id": "cmd-3",
                        "commandType": "SOMETHING_ELSE",
                        "liveDataSessionId": "live-1",
                    }
                ],
            )
        )
        poll_live_data_command_queue(client, poller)
        assert poller.is_running is False

    def test_poll_command_without_session_id_is_ignored(self):
        poller = LiveDataPoller(MagicMock(agent_id="agent-1"), agent_id="agent-1")
        client = MagicMock()
        client.agent_id = "agent-1"
        client.get = MagicMock(
            return_value=_Command(
                200,
                [
                    {
                        "id": "cmd-4",
                        "commandType": "LIVE_DATA_POLL",
                        "liveDataSessionId": None,
                        "payload": {"cadenceMs": 1000, "pids": []},
                    }
                ],
            )
        )
        poll_live_data_command_queue(client, poller)
        assert poller.is_running is False

    def test_does_not_poll_when_agent_id_missing(self):
        poller = LiveDataPoller(MagicMock(), agent_id=None)
        client = MagicMock()
        client.agent_id = None
        client.get = MagicMock()
        poll_live_data_command_queue(client, poller)
        client.get.assert_not_called()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
