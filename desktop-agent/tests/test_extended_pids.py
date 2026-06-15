"""Tests for extended PID reader functions.

Covers decoder correctness for PIDs 06, 07, 08, 09, 0B, 10, 11
and error handling for unsupported, NO DATA, prefix mismatch,
and malformed responses.
"""

import pytest

from src.obd.mock_adapter import MockObdAdapter
from src.obd.commands.extended_pids import (
    CONFIGURED_EXTENDED_PIDS,
    EXTENDED_PID_NAMES,
    EXTENDED_PID_UNITS,
    read_stft_bank1,
    read_ltft_bank1,
    read_stft_bank2,
    read_ltft_bank2,
    read_map,
    read_maf,
    read_throttle_position,
)


# ---------------------------------------------------------------------------
# Helper: adapter that returns a specific hex response for a command
# ---------------------------------------------------------------------------

class _FixedAdapter:
    """Mock adapter that returns a fixed hex response for any command."""

    protocol = "TEST"
    adapter_type = "TEST"

    def __init__(self, hex_response: str | None):
        self._hex = hex_response

    def connect(self) -> bool:
        return True

    def is_connected(self) -> bool:
        return True

    def send(self, command: str) -> bytes:
        if self._hex is None:
            return b""
        # Return ASCII hex bytes, same as MockObdAdapter does
        return self._hex.encode("ascii")


class _EmptyAdapter:
    """Mock adapter that returns empty bytes for all commands."""

    protocol = "TEST"
    adapter_type = "TEST"

    def connect(self) -> bool:
        return True

    def is_connected(self) -> bool:
        return True

    def send(self, command: str) -> bytes:
        return b""


# ---------------------------------------------------------------------------
# TestFuelTrimDecoding — PIDs 06, 07, 08, 09
# ---------------------------------------------------------------------------

class TestFuelTrimDecoding:
    """Fuel trim readers decode correctly for known hex inputs."""

    def test_stft_bank1_zero(self):
        """PID 06: 410680 → 0.0% (A=0x80=128)."""
        adapter = _FixedAdapter("410680")
        result = read_stft_bank1(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"] == 0.0
        assert result["unit"] == "%"
        assert result["pid"] == "06"

    def test_stft_bank1_negative(self):
        """PID 06: 41067F → approximately -0.78% (A=0x7F=127)."""
        adapter = _FixedAdapter("41067F")
        result = read_stft_bank1(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"] == pytest.approx(-0.78, abs=0.01)
        assert result["pid"] == "06"

    def test_stft_bank1_max(self):
        """PID 06: 4106FF → approximately 99.22% (A=0xFF=255)."""
        adapter = _FixedAdapter("4106FF")
        result = read_stft_bank1(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"] == pytest.approx(99.22, abs=0.01)

    def test_ltft_bank1_zero(self):
        """PID 07: 410780 → 0.0%."""
        adapter = _FixedAdapter("410780")
        result = read_ltft_bank1(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"] == 0.0
        assert result["pid"] == "07"

    def test_stft_bank2_negative(self):
        """PID 08: 41087F → approximately -0.78%."""
        adapter = _FixedAdapter("41087F")
        result = read_stft_bank2(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"] == pytest.approx(-0.78, abs=0.01)
        assert result["pid"] == "08"

    def test_ltft_bank2_positive(self):
        """PID 09: 41098D → approximately 10.16% (A=0x8D=141)."""
        adapter = _FixedAdapter("41098D")
        result = read_ltft_bank2(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"] == pytest.approx(10.16, abs=0.01)
        assert result["pid"] == "09"


# ---------------------------------------------------------------------------
# TestMafDecoding — PID 10
# ---------------------------------------------------------------------------

class TestMafDecoding:
    """MAF reader decodes correctly for known hex inputs."""

    def test_maf_one_grams_per_second(self):
        """PID 10: 41100064 → 1.00 g/s ((0*256+100)/100)."""
        adapter = _FixedAdapter("41100064")
        result = read_maf(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"] == 1.0
        assert result["unit"] == "g/s"
        assert result["pid"] == "10"

    def test_maf_high_value(self):
        """PID 10: 411001FF → 5.11 g/s ((1*256+255)/100)."""
        adapter = _FixedAdapter("411001FF")
        result = read_maf(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"] == pytest.approx(5.11, abs=0.01)


# ---------------------------------------------------------------------------
# TestThrottleDecoding — PID 11
# ---------------------------------------------------------------------------

class TestThrottleDecoding:
    """Throttle position reader decodes correctly for known hex inputs."""

    def test_throttle_low(self):
        """PID 11: 411105 → approximately 1.96% (A=0x05=5, 5*100/255)."""
        adapter = _FixedAdapter("411105")
        result = read_throttle_position(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"] == pytest.approx(1.96, abs=0.01)
        assert result["unit"] == "%"
        assert result["pid"] == "11"

    def test_throttle_zero(self):
        """PID 11: 411100 → 0%."""
        adapter = _FixedAdapter("411100")
        result = read_throttle_position(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"] == 0.0

    def test_throttle_full(self):
        """PID 11: 4111FF → approximately 100% (255*100/255)."""
        adapter = _FixedAdapter("4111FF")
        result = read_throttle_position(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"] == pytest.approx(100.0, abs=0.01)


# ---------------------------------------------------------------------------
# TestMapDecoding — PID 0B
# ---------------------------------------------------------------------------

class TestMapDecoding:
    """MAP reader decodes correctly for known hex inputs."""

    def test_map_42_kpa(self):
        """PID 0B: 410B2A → 42 kPa (A=0x2A=42)."""
        adapter = _FixedAdapter("410B2A")
        result = read_map(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"] == 42.0
        assert result["unit"] == "kPa"
        assert result["pid"] == "0B"

    def test_map_zero(self):
        """PID 0B: 410B00 → 0 kPa."""
        adapter = _FixedAdapter("410B00")
        result = read_map(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"] == 0.0


# ---------------------------------------------------------------------------
# TestExtendedPidErrorHandling
# ---------------------------------------------------------------------------

class TestExtendedPidErrorHandling:
    """Error handling for unsupported, NO DATA, prefix mismatch, and malformed responses."""

    def test_unsupported_pid_returns_not_supported(self):
        """When adapter returns empty bytes, reader returns supported=False."""
        adapter = _EmptyAdapter()
        result = read_stft_bank1(adapter)
        assert result["supported"] is False
        assert result["available"] is False
        assert result["value"] is None

    def test_wrong_prefix_returns_unavailable(self):
        """When response prefix doesn't match PID, reader returns unavailable."""
        # PID 06 expects prefix 4106, but we give 4107
        adapter = _FixedAdapter("410780")
        result = read_stft_bank1(adapter)
        assert result["supported"] is True
        assert result["available"] is False
        assert result["value"] is None

    def test_insufficient_bytes_returns_unavailable(self):
        """When response has only prefix with no data bytes, reader returns unavailable."""
        # PID 10 (MAF) needs 2 data bytes after prefix 4110
        adapter = _FixedAdapter("4110")
        result = read_maf(adapter)
        assert result["supported"] is True
        assert result["available"] is False
        assert result["value"] is None

    def test_adapter_error_response_returns_unsupported(self):
        """When adapter returns a recognizable error, _send_pid returns None → unsupported."""
        # The _send_pid function filters out NO DATA and other error responses.
        # An empty response from adapter means _send_pid returns None.
        adapter = _EmptyAdapter()
        result = read_stft_bank1(adapter)
        assert result["supported"] is False

    def test_result_shape_matches_three_state_model(self):
        """All results have pid, value, unit, supported, available, rawResponse keys."""
        adapter = _FixedAdapter("410680")
        result = read_stft_bank1(adapter)
        assert "pid" in result
        assert "value" in result
        assert "unit" in result
        assert "supported" in result
        assert "available" in result
        assert "rawResponse" in result

    def test_configured_extended_pids_has_seven_entries(self):
        """CONFIGURED_EXTENDED_PIDS contains exactly 7 PIDs."""
        assert len(CONFIGURED_EXTENDED_PIDS) == 7
        assert set(CONFIGURED_EXTENDED_PIDS.keys()) == {"06", "07", "08", "09", "0B", "10", "11"}

    def test_extended_pid_names_covers_all(self):
        """EXTENDED_PID_NAMES has a name for every configured PID."""
        for pid_hex in CONFIGURED_EXTENDED_PIDS:
            assert pid_hex in EXTENDED_PID_NAMES
            assert isinstance(EXTENDED_PID_NAMES[pid_hex], str)
            assert len(EXTENDED_PID_NAMES[pid_hex]) > 0

    def test_extended_pid_units_covers_all(self):
        """EXTENDED_PID_UNITS has a unit for every configured PID."""
        for pid_hex in CONFIGURED_EXTENDED_PIDS:
            assert pid_hex in EXTENDED_PID_UNITS
            assert isinstance(EXTENDED_PID_UNITS[pid_hex], str)
            assert len(EXTENDED_PID_UNITS[pid_hex]) > 0