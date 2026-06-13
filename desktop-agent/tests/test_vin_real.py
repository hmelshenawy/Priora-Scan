"""Tests for read_vin with real ELM327 adapter responses."""

from unittest.mock import MagicMock

import pytest

from src.obd.commands.vin import read_vin


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_wifi_adapter(responses: dict):
    """Create a mock WifiElm327Adapter that returns given responses."""
    adapter = MagicMock()
    adapter.adapter_type = "ELM327_WIFI"
    adapter.is_connected = MagicMock(return_value=True)

    # Track call index for multi-call scenarios
    call_idx = [0]
    response_list = list(responses.values()) if isinstance(responses, dict) else responses

    def send_side_effect(cmd):
        idx = call_idx[0]
        call_idx[0] += 1
        if idx < len(response_list):
            return response_list[idx]
        return b"NO DATA\r>"

    adapter.send = MagicMock(side_effect=send_side_effect)
    return adapter


def _make_mock_adapter(vin_hex: bytes):
    """Create a mock MockObdAdapter."""
    adapter = MagicMock()
    adapter.adapter_type = "MOCK"
    adapter.is_connected = MagicMock(return_value=True)
    adapter.send = MagicMock(return_value=vin_hex)
    return adapter


# ---------------------------------------------------------------------------
# Real VIN parsing
# ---------------------------------------------------------------------------

class TestReadVinReal:
    def test_multi_frame_vin(self):
        """Real ELM327 multi-frame VIN response (Mode 09 PID 02)."""
        # Simulates a 3-frame VIN response for "1HGCM82633A004352"
        # Frame 1: 49 02 01 05 <5 data bytes>
        # Frame 2: 49 02 02 <7 data bytes>
        # Frame 3: 49 02 03 <5 data bytes>
        raw = (
            b"49 02 01 05 31 48 47 43 4D 38\r"
            b"49 02 02 32 36 33 33 41 30 30 34\r"
            b"49 02 03 33 35 32\r"
            b">"
        )
        adapter = _make_wifi_adapter([raw])
        vin = read_vin(adapter)
        assert len(vin) == 17
        # VIN should start with "1HG" (common Honda prefix)
        assert vin.startswith("1HG")

    def test_no_data_response(self):
        """NO DATA from ECU means VIN not supported."""
        adapter = _make_wifi_adapter([b"NO DATA\r>"])
        with pytest.raises(RuntimeError, match="not supported"):
            read_vin(adapter)

    def test_unsupported_command(self):
        """'?' from ELM327 means command not understood."""
        adapter = _make_wifi_adapter([b"?\r>"])
        with pytest.raises(RuntimeError, match="failed"):
            read_vin(adapter)

    def test_truncated_response(self):
        """Partial VIN frame data — should raise for invalid length."""
        # Only frame 1, no frame 2 — incomplete VIN
        raw = b"49 02 01 05 00 00 00 31 48 47 43\r>"
        adapter = _make_wifi_adapter([raw])
        # Will either get a VIN with wrong length or an error
        with pytest.raises(RuntimeError):
            read_vin(adapter)

    def test_mock_adapter_still_works(self):
        """Mock adapter should continue using simple hex decode."""
        # Mock adapter returns compact hex: "1DBINID3801234AB" encoded
        vin_hex = b"49025744443231333030343141313233343536"
        adapter = _make_mock_adapter(vin_hex)
        vin = read_vin(adapter)
        assert len(vin) == 17

    def test_searching_stripped(self):
        """SEARCHING... prefix is handled before VIN parsing."""
        raw = (
            b"SEARCHING...\r"
            b"49 02 01 05 31 48 47 43 4D 38\r"
            b"49 02 02 32 36 33 33 41 30 30 34\r"
            b"49 02 03 33 35 32\r"
            b">"
        )
        adapter = _make_wifi_adapter([raw])
        vin = read_vin(adapter)
        assert len(vin) == 17