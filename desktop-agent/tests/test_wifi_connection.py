"""Unit tests for WifiConnection — mock socket layer."""

import socket
import time
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

from src.obd.connection.wifi import WifiConnection, INTER_COMMAND_DELAY_SECONDS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_connected_conn(responses=None):
    """Create a WifiConnection with a mocked socket that's already connected.

    Args:
        responses: List of byte sequences to return from recv(), in order.
                   If None, returns b">" for each recv call.
    """
    conn = WifiConnection(host="192.168.0.10", port=35000, timeout=5)

    mock_sock = MagicMock(spec=socket.socket)
    mock_sock.connect = MagicMock()
    mock_sock.sendall = MagicMock()
    mock_sock.getpeername.return_value = ("192.168.0.10", 35000)
    mock_sock.close = MagicMock()
    mock_sock.shutdown = MagicMock()

    if responses is not None:
        mock_sock.recv = MagicMock(side_effect=responses)
    else:
        mock_sock.recv = MagicMock(return_value=b">")

    # Bypass open() by directly setting internals
    conn._socket = mock_sock
    conn._connected = True
    conn._last_command_at = None

    return conn, mock_sock


# ---------------------------------------------------------------------------
# Connect
# ---------------------------------------------------------------------------

class TestWifiConnectionOpen:
    def test_connect_success(self):
        conn = WifiConnection(host="192.168.0.10", port=35000, timeout=5)
        with patch("src.obd.connection.wifi.socket.socket") as mock_socket_cls:
            mock_sock = MagicMock()
            mock_sock.connect = MagicMock()
            mock_sock.getpeername.return_value = ("192.168.0.10", 35000)
            mock_socket_cls.return_value = mock_sock
            conn.open()
        assert conn.is_open()

    def test_connect_timeout(self):
        conn = WifiConnection(timeout=1)
        with patch("src.obd.connection.wifi.socket.socket") as mock_socket_cls:
            mock_sock = MagicMock()
            mock_sock.connect = MagicMock(side_effect=socket.timeout("timed out"))
            mock_socket_cls.return_value = mock_sock
            with pytest.raises(TimeoutError):
                conn.open()
        assert not conn.is_open()

    def test_connect_refused(self):
        conn = WifiConnection()
        with patch("src.obd.connection.wifi.socket.socket") as mock_socket_cls:
            mock_sock = MagicMock()
            mock_sock.connect = MagicMock(side_effect=ConnectionRefusedError("refused"))
            mock_socket_cls.return_value = mock_sock
            with pytest.raises(ConnectionError):
                conn.open()
        assert not conn.is_open()


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

class TestWifiConnectionRead:
    def test_read_until_prompt(self):
        conn, mock_sock = _make_connected_conn([
            b"41 0C FF 1A\r\r", b">"
        ])
        result = conn.read()
        assert b">" in result
        assert b"41 0C" in result

    def test_read_timeout(self):
        conn, mock_sock = _make_connected_conn()
        mock_sock.recv = MagicMock(side_effect=socket.timeout("timed out"))
        with pytest.raises(TimeoutError):
            conn.read()

    def test_read_returns_partial_bytes_when_timeout_after_data(self):
        conn, mock_sock = _make_connected_conn([
            b"ELM327 v2.3\r",
            socket.timeout("timed out"),
        ])

        result = conn.read()

        assert result == b"ELM327 v2.3\r"

    def test_read_timeout_only_when_zero_bytes_received(self):
        conn, mock_sock = _make_connected_conn([
            socket.timeout("timed out"),
        ])

        with pytest.raises(TimeoutError):
            conn.read()

    def test_remote_close_with_partial_bytes_returns_partial_response(self):
        conn, mock_sock = _make_connected_conn([
            b"41 00 BE 1F B8 20\r",
            b"",
        ])

        result = conn.read()

        assert result == b"41 00 BE 1F B8 20\r"
        assert not conn.is_open()


# ---------------------------------------------------------------------------
# Write & inter-command delay
# ---------------------------------------------------------------------------

class TestWifiConnectionWrite:
    def test_write_success(self):
        conn, mock_sock = _make_connected_conn()
        conn.write(b"0902\r")
        mock_sock.sendall.assert_called_once_with(b"0902\r")

    def test_inter_command_delay_enforced(self):
        conn, mock_sock = _make_connected_conn()
        # First write sets _last_command_at
        conn.write(b"ATZ\r")
        # Immediately try second write — should sleep for the remainder
        start = time.monotonic()
        conn.write(b"ATE0\r")
        elapsed = time.monotonic() - start
        # Should have waited at least ~80ms (100ms delay - tiny elapsed)
        assert elapsed >= INTER_COMMAND_DELAY_SECONDS * 0.8

    def test_write_when_not_connected_raises(self):
        conn = WifiConnection()
        with pytest.raises(ConnectionError):
            conn.write(b"ATZ\r")


# ---------------------------------------------------------------------------
# Close
# ---------------------------------------------------------------------------

class TestWifiConnectionClose:
    def test_close(self):
        conn, mock_sock = _make_connected_conn()
        assert conn.is_open()
        conn.close()
        assert not conn.is_open()

    def test_close_idempotent(self):
        conn = WifiConnection()
        conn.close()  # should not raise
        assert not conn.is_open()

    def test_reconnection_after_close(self):
        conn, mock_sock = _make_connected_conn()
        conn.close()
        assert not conn.is_open()

        # Reconnect
        with patch("src.obd.connection.wifi.socket.socket") as mock_socket_cls:
            mock_sock2 = MagicMock()
            mock_sock2.connect = MagicMock()
            mock_sock2.getpeername.return_value = ("192.168.0.10", 35000)
            mock_socket_cls.return_value = mock_sock2
            conn.open()
        assert conn.is_open()
