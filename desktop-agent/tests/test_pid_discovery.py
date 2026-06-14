"""Tests for PID capability discovery with bitmap chain-following.

Covers: FR-001 (bitmap discovery), FR-016 (chain stops when bit 32 clear),
SC-009 (Toyota regression), AC #10 (tests for PID discovery).
"""

import pytest

from src.obd.mock_adapter import MockObdAdapter


class MockAdapter:
    """Simple mock adapter that returns pre-programmed byte responses.

    Unlike MockObdAdapter which converts profile bytes to ASCII hex,
    this adapter returns bytes directly for fine-grained test control.
    The vehicle_data readers use _send_pid which decodes the adapter
    response as UTF-8 then strips whitespace, so we provide ASCII hex strings.
    """

    def __init__(self, responses: dict):
        self._responses = responses
        self._sent_commands: list[str] = []

    def send(self, cmd: str) -> bytes:
        self._sent_commands.append(cmd)
        return self._responses.get(cmd, b"")


class TestBitmapChainFollowsBit32:
    """Bitmap chain-following: 0100 → 0120 → 0140 based on bit 32."""

    def test_chain_stops_when_bit32_clear(self):
        """When 0100 bitmap has bit 32 clear, only 0100 is queried."""
        # 4100BE1FB812 — last byte 0x12 = 00010010, bit 0 = 0 → chain stops
        adapter = MockAdapter({
            "0100": b"4100BE1FB812",
        })
        from src.obd.commands.vehicle_data import read_supported_pids
        result = read_supported_pids(adapter)

        # Only 0100 was queried
        assert "0100" in adapter._sent_commands
        assert "0120" not in adapter._sent_commands
        assert "0140" not in adapter._sent_commands
        # PIDs from 0100 bitmap should be present
        assert "04" in result["01"]
        assert "05" in result["01"]

    def test_chain_queries_0120_when_bit32_set(self):
        """When 0100 bitmap has bit 32 set, 0120 is also queried."""
        # 4100BE1FB813 — last byte 0x13 = 00010011, bit 0 = 1 → chain continues
        adapter = MockAdapter({
            "0100": b"4100BE1FB813",
            "0120": b"412000000000",  # bit 32 clear → chain stops
        })
        from src.obd.commands.vehicle_data import read_supported_pids
        result = read_supported_pids(adapter)

        assert "0100" in adapter._sent_commands
        assert "0120" in adapter._sent_commands
        assert "0140" not in adapter._sent_commands

    def test_chain_queries_0140_when_0120_bit32_set(self):
        """When 0120 bitmap has bit 32 set, 0140 is also queried."""
        adapter = MockAdapter({
            "0100": b"4100BE1FB813",  # bit 32 set → query 0120
            "0120": b"412000000001",  # bit 32 set → query 0140
            "0140": b"414040000000",  # bit 32 clear → stop
        })
        from src.obd.commands.vehicle_data import read_supported_pids
        result = read_supported_pids(adapter)

        assert "0100" in adapter._sent_commands
        assert "0120" in adapter._sent_commands
        assert "0140" in adapter._sent_commands

        # PID 0x42 should be in discovered list (from 0140 bitmap)
        assert "42" in result["01"]

    def test_chain_stops_at_intermediate_clear_bit(self):
        """Chain stops when an intermediate bitmap has bit 32 clear."""
        adapter = MockAdapter({
            "0100": b"4100BE1FB813",  # bit 32 set → query 0120
            "0120": b"412000000000",  # bit 32 clear → stop
        })
        from src.obd.commands.vehicle_data import read_supported_pids
        result = read_supported_pids(adapter)

        assert "0100" in adapter._sent_commands
        assert "0120" in adapter._sent_commands
        assert "0140" not in adapter._sent_commands

    def test_0100_no_data_falls_back(self):
        """When 0100 returns NO DATA, discovery returns empty supported list."""
        adapter = MockAdapter({})  # No responses at all
        from src.obd.commands.vehicle_data import read_supported_pids
        result = read_supported_pids(adapter)

        # No PIDs discovered (empty 01 list)
        assert result["01"] == []
        assert "0120" not in adapter._sent_commands


class TestToyotaProfileBitmapChain:
    """T020: Verify bitmap chain for Toyota profile with corrected bitmaps."""

    def test_toyota_queries_0100_0120_0140(self):
        """Toyota profile: 0100 bit 32 set → 0120 → 0140 → stop."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        from src.obd.commands.vehicle_data import read_supported_pids
        result = read_supported_pids(adapter)

        # PID 0x42 (voltage) discovered from 0140 range
        assert "42" in result["01"], "PID 0x42 must be discovered from 0140 range"

        # PID 0x2F NOT in supported list (not in 0120 bitmap)
        assert "2F" not in result["01"], "PID 0x2F should not be in supported list"

        # Chain indicators (0x20, 0x40) are in the list — they are valid PIDs
        # that the bitmap reports as "supported" (bit 32 = chain indicator)
        assert "20" in result["01"], "PID 0x20 (chain indicator from 0100) should be in list"
        assert "40" in result["01"], "PID 0x40 (chain indicator from 0120) should be in list"


class TestPidDiscoveryFallback:
    """When PID 0100 fails, all health PIDs should still be attempted."""

    def test_no_bitmap_uses_fallback(self):
        """When adapter returns no bitmap data, all configured PIDs are attempted."""
        from src.obd.commands.vehicle_data import read_vehicle_health

        # Create adapter with NO bitmap response but WITH data for health PIDs
        adapter = MockAdapter({
            "0104": b"410476",
            "0105": b"41057E",
            "010C": b"410C0E10",
            "010D": b"410D00",
            "0142": b"41423469",
        })
        health = read_vehicle_health(adapter)

        # With no bitmap, fallback means all PIDs are in supportedHealthPids
        assert "04" in health["supportedHealthPids"]
        assert "0C" in health["supportedHealthPids"]
        # RPM should still decode correctly even without discovery
        assert health["rpm"]["value"] == 900.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])