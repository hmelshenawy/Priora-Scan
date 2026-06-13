"""Unit tests for WifiElm327Adapter — mock WifiConnection layer."""

from unittest.mock import MagicMock, patch, PropertyMock

import pytest

from src.obd.wifi_elm327 import WifiElm327Adapter


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_adapter_with_mock_connection():
    """Create a WifiElm327Adapter with a mocked WifiConnection."""
    adapter = WifiElm327Adapter.__new__(WifiElm327Adapter)
    adapter.adapter_type = "ELM327_WIFI"
    adapter.protocol = "AUTO"
    adapter._initialized = False

    conn_mock = MagicMock()
    conn_mock.host = "192.168.0.10"
    conn_mock.port = 35000
    conn_mock.is_open = MagicMock(return_value=False)
    conn_mock.open = MagicMock()
    conn_mock.close = MagicMock()
    conn_mock.write = MagicMock()

    adapter._connection = conn_mock
    return adapter, conn_mock


def _setup_init_responses(conn_mock, responses=None):
    """Wire up mock read responses for the ELM327 init sequence.

    Default: all init commands return OK.
    """
    if responses is None:
        responses = iter([
            b"ELM327 v2.3\r>",     # ATZ
            b"OK\r>",              # ATE0
            b"OK\r>",              # ATL0
            b"OK\r>",              # ATS0
            b"OK\r>",              # ATH0
            b"OK\r>",              # ATSP0
            b"6\r>",               # ATDPN
        ])

    conn_mock.read = MagicMock(side_effect=lambda: next(responses, b">"))
    conn_mock.is_open = MagicMock(return_value=True)


# ---------------------------------------------------------------------------
# Connect
# ---------------------------------------------------------------------------

class TestWifiElm327Connect:
    def test_connect_success(self):
        adapter, conn_mock = _make_adapter_with_mock_connection()
        _setup_init_responses(conn_mock)

        with patch("src.obd.wifi_elm327.time.sleep"):
            result = adapter.connect()

        assert result is True
        assert adapter.is_connected()

    def test_connect_timeout_with_retry(self):
        adapter, conn_mock = _make_adapter_with_mock_connection()

        # First attempt: connection fails
        # Second attempt: connection succeeds
        call_count = [0]
        original_open = conn_mock.open

        def open_side_effect():
            call_count[0] += 1
            if call_count[0] == 1:
                raise TimeoutError("timeout")
            # Second call succeeds
            conn_mock.is_open = MagicMock(return_value=True)

        conn_mock.open = MagicMock(side_effect=open_side_effect)
        _setup_init_responses(conn_mock)

        with patch("src.obd.wifi_elm327.time.sleep"):
            result = adapter.connect()

        assert result is True

    def test_ats0_failure_returns_question_mark(self):
        """ATS0 returns '?' (unsupported) — non-critical, should continue."""
        adapter, conn_mock = _make_adapter_with_mock_connection()

        responses = iter([
            b"ELM327 v2.3\r>",     # ATZ
            b"OK\r>",              # ATE0
            b"OK\r>",              # ATL0
            b"?\r>",               # ATS0 — unsupported, non-critical
            b"OK\r>",              # ATH0
            b"OK\r>",              # ATSP0
            b"6\r>",               # ATDPN
        ])
        conn_mock.read = MagicMock(side_effect=lambda: next(responses, b">"))
        conn_mock.is_open = MagicMock(return_value=True)

        with patch("src.obd.wifi_elm327.time.sleep"):
            result = adapter.connect()

        assert result is True

    def test_atsp0_failure_returns_false(self):
        """ATSP0 failure aborts init sequence."""
        adapter, conn_mock = _make_adapter_with_mock_connection()

        responses = iter([
            b"ELM327 v2.3\r>",     # ATZ
            b"OK\r>",              # ATE0
            b"OK\r>",              # ATL0
            b"OK\r>",              # ATS0
            b"OK\r>",              # ATH0
            b"?\r>",               # ATSP0 — FAIL (abort)
        ])
        conn_mock.read = MagicMock(side_effect=lambda: next(responses, b">"))
        conn_mock.is_open = MagicMock(return_value=True)

        with patch("src.obd.wifi_elm327.time.sleep"):
            result = adapter.connect()

        assert result is False

    def test_all_retries_exhausted(self):
        """All 3 connect attempts fail -> returns False."""
        adapter, conn_mock = _make_adapter_with_mock_connection()
        conn_mock.open = MagicMock(side_effect=ConnectionError("refused"))

        with patch("src.obd.wifi_elm327.time.sleep"):
            result = adapter.connect()

        assert result is False
        assert not adapter.is_connected()


# ---------------------------------------------------------------------------
# Send
# ---------------------------------------------------------------------------

class TestWifiElm327Send:
    def test_send_returns_response(self):
        adapter, conn_mock = _make_adapter_with_mock_connection()
        _setup_init_responses(conn_mock)

        with patch("src.obd.wifi_elm327.time.sleep"):
            adapter.connect()

        # Now send a real command
        conn_mock.read = MagicMock(return_value=b"41 0C FF 1A\r>")
        result = adapter.send("010C")

        assert b"41 0C" in result

    def test_send_when_not_connected_raises(self):
        adapter, _ = _make_adapter_with_mock_connection()
        # Never connected
        with pytest.raises(RuntimeError, match="not connected"):
            adapter.send("010C")


# ---------------------------------------------------------------------------
# Close
# ---------------------------------------------------------------------------

class TestWifiElm327Close:
    def test_close(self):
        adapter, conn_mock = _make_adapter_with_mock_connection()
        _setup_init_responses(conn_mock)

        with patch("src.obd.wifi_elm327.time.sleep"):
            adapter.connect()
        assert adapter.is_connected()

        adapter.close()
        assert not adapter.is_connected()

    def test_reconnect_after_disconnect(self):
        adapter, conn_mock = _make_adapter_with_mock_connection()
        _setup_init_responses(conn_mock)

        with patch("src.obd.wifi_elm327.time.sleep"):
            adapter.connect()
        adapter.close()

        # Reconnect
        _setup_init_responses(conn_mock)
        with patch("src.obd.wifi_elm327.time.sleep"):
            result = adapter.connect()

        assert result is True
        assert adapter.is_connected()