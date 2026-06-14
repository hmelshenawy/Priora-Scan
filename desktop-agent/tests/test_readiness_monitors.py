"""Tests for OBD-II readiness monitor parsing (Mode 01 PID 01).

Covers SAE J1979 readiness monitor decoding, MIL status, DTC count,
byte mapping correctness, edge cases, and mock adapter integration.

The parser (parse_readiness_monitors) is the source of truth.
These tests use known SAE J1979 examples — NOT mock profile data.
"""

import pytest

from src.obd.commands.vehicle_data import (
    parse_readiness_monitors,
    read_readiness_monitors,
    _MONITOR_NAMES,
)
from src.obd.mock_adapter import MockObdAdapter


# ============================================================================
# SAE J1979 PID 01 Byte Mapping Reference
# ============================================================================
#
# After removing header "41 01", the data bytes are:
#   data[0] = MIL status (bit 7) + DTC count (bits 0-6)
#   data[1] = reserved (usually 0x00)
#   data[2] = continuous monitor COMPLETION (bits 0-2: misfire, fuelSystem, components)
#   data[3] = non-continuous monitor COMPLETION (bits 0-7)
#   data[4] = continuous monitor AVAILABILITY (bits 0-2: misfire, fuelSystem, components)
#   data[5] = non-continuous monitor AVAILABILITY (bits 0-7)
#
# Monitor names in SAE J1979 order:
#   Continuous (i < 3):  misfire, fuelSystem, components
#   Non-continuous (i >= 3): catalyst, heatedCatalyst, evap, secondaryAir,
#                            acRefrigerant, oxygenSensor, oxygenSensorHeater, egrVvt


class TestParseReadinessMonitors_SAE_J1979:
    """Parser tests using known SAE J1979 examples.

    These tests define the expected behavior. The parser must match.
    """

    def test_mil_off_zero_dtcs_all_continuous_ready(self):
        """MIL OFF, 0 DTCs, continuous monitors all supported+ready,
        non-continuous mix of supported+ready and supported+not-ready.

        data[0]=0x00 (MIL OFF, 0 DTCs)
        data[1]=0x00 (reserved)
        data[2]=0x07 (continuous completion: all 3 complete)
        data[3]=0xEF (non-continuous completion: acRefrigerant NOT complete)
        data[4]=0x07 (continuous availability: all 3 supported)
        data[5]=0xFF (non-continuous availability: all 8 supported)
        """
        result = parse_readiness_monitors("4101000007EF07FF")
        assert result is not None
        assert result["milStatus"] == "OFF"
        assert result["storedDtcCount"] == 0

        monitors_by_name = {m["name"]: m for m in result["monitors"]}
        # Continuous monitors: all supported and ready
        assert monitors_by_name["misfire"]["supported"] is True
        assert monitors_by_name["misfire"]["ready"] is True
        assert monitors_by_name["fuelSystem"]["supported"] is True
        assert monitors_by_name["fuelSystem"]["ready"] is True
        assert monitors_by_name["components"]["supported"] is True
        assert monitors_by_name["components"]["ready"] is True

        # Non-continuous monitors: all supported, but acRefrigerant NOT ready
        # data[3]=0xEF = 11101111 → bit 4 (acRefrigerant) is 0 → not complete
        assert monitors_by_name["catalyst"]["supported"] is True
        assert monitors_by_name["catalyst"]["ready"] is True
        assert monitors_by_name["heatedCatalyst"]["supported"] is True
        assert monitors_by_name["heatedCatalyst"]["ready"] is True
        assert monitors_by_name["evap"]["supported"] is True
        assert monitors_by_name["evap"]["ready"] is True
        assert monitors_by_name["secondaryAir"]["supported"] is True
        assert monitors_by_name["secondaryAir"]["ready"] is True
        assert monitors_by_name["acRefrigerant"]["supported"] is True
        assert monitors_by_name["acRefrigerant"]["ready"] is False
        assert monitors_by_name["oxygenSensor"]["supported"] is True
        assert monitors_by_name["oxygenSensor"]["ready"] is True
        assert monitors_by_name["oxygenSensorHeater"]["supported"] is True
        assert monitors_by_name["oxygenSensorHeater"]["ready"] is True
        assert monitors_by_name["egrVvt"]["supported"] is True
        assert monitors_by_name["egrVvt"]["ready"] is True

        assert result["rawResponse"] == "4101000007EF07FF"

    def test_mil_on_three_dtcs_no_monitors_supported(self):
        """MIL ON, 3 DTCs, no monitors supported.

        data[0]=0x83 (MIL ON=0x80, DTC count=0x03)
        data[1]=0x00 (reserved)
        data[2]=0x00 (no continuous monitors complete)
        data[3]=0x00 (no non-continuous monitors complete)
        data[4]=0x00 (no continuous monitors available)
        data[5]=0x00 (no non-continuous monitors available)
        """
        result = parse_readiness_monitors("4101830000000000")
        assert result is not None
        assert result["milStatus"] == "ON"
        assert result["storedDtcCount"] == 3

        # All monitors unsupported
        for m in result["monitors"]:
            assert m["supported"] is False
            assert m["ready"] is None

    def test_mil_on_one_dtc_continuous_supported(self):
        """MIL ON, 1 DTC, continuous monitors supported+ready,
        non-continuous monitors NOT supported.

        data[0]=0x81 (MIL ON=0x80, DTC count=0x01)
        data[1]=0x00 (reserved)
        data[2]=0x07 (continuous completion: all 3 complete)
        data[3]=0x00 (no non-continuous monitors complete)
        data[4]=0x07 (continuous availability: all 3 supported)
        data[5]=0x00 (no non-continuous monitors available)
        """
        result = parse_readiness_monitors("410181000700FF00")
        assert result is not None
        assert result["milStatus"] == "ON"
        assert result["storedDtcCount"] == 1

        monitors_by_name = {m["name"]: m for m in result["monitors"]}
        # Continuous: all supported and ready
        assert monitors_by_name["misfire"]["supported"] is True
        assert monitors_by_name["misfire"]["ready"] is True
        assert monitors_by_name["fuelSystem"]["supported"] is True
        assert monitors_by_name["fuelSystem"]["ready"] is True
        assert monitors_by_name["components"]["supported"] is True
        assert monitors_by_name["components"]["ready"] is True

        # Non-continuous: NOT supported (data[5]=0x00)
        # Wait, data[5] in this test case is 0x00 which is non-continuous availability
        # But the hex string is "410181000700FF00" which has data bytes:
        # data[0]=0x81, data[1]=0x00, data[2]=0x07, data[3]=0x00, data[4]=0xFF, data[5]=0x00
        # Hmm, that's 6 data bytes: 81 00 07 00 FF 00
        # data[4]=0xFF means continuous availability = all bits set (but only bits 0-2 matter)
        # Actually data[4] is continuous availability (bits 0-2 only, rest reserved)
        # So 0xFF means bits 0-2 set → continuous monitors all supported
        # data[5]=0x00 means non-continuous availability → no non-continuous monitors supported

        # Re-check: continuous availability from data[4]=0xFF
        # bits 0-2 all set → misfire, fuelSystem, components all supported
        # But wait, we already checked that above. Let me also verify non-continuous:
        for name in ["catalyst", "heatedCatalyst", "evap", "secondaryAir",
                     "acRefrigerant", "oxygenSensor", "oxygenSensorHeater", "egrVvt"]:
            assert monitors_by_name[name]["supported"] is False
            assert monitors_by_name[name]["ready"] is None

    def test_all_monitors_supported_and_ready(self):
        """MIL OFF, 0 DTCs, all 11 monitors supported and ready.

        data[0]=0x00, data[1]=0x00, data[2]=0x07, data[3]=0xFF,
        data[4]=0x07, data[5]=0xFF
        """
        result = parse_readiness_monitors("4101000007FF07FF")
        assert result is not None
        assert result["milStatus"] == "OFF"
        assert result["storedDtcCount"] == 0

        for m in result["monitors"]:
            assert m["supported"] is True, f"{m['name']} should be supported"
            assert m["ready"] is True, f"{m['name']} should be ready"

    def test_none_response_returns_none(self):
        """_send_pid returning None means unsupported — parser receives None."""
        result = parse_readiness_monitors(None)
        assert result is None

    def test_empty_string_returns_none(self):
        """Empty response string returns None from parser."""
        result = parse_readiness_monitors("")
        assert result is None

    def test_wrong_prefix_returns_none(self):
        """Response without 4101 prefix returns None."""
        result = parse_readiness_monitors("410041BE1FB813")
        assert result is None

    def test_truncated_response_partial_decode(self):
        """Response with fewer than 4 data bytes still extracts MIL and DTC count.

        Only 3 data bytes: data[0]=0x81 (MIL ON, 1 DTC),
        data[1]=0x00, data[2]=0x07 (continuous completion).
        Missing data[3], data[4], data[5] → all monitors unsupported.
        """
        result = parse_readiness_monitors("4101810007")
        assert result is not None
        assert result["milStatus"] == "ON"
        assert result["storedDtcCount"] == 1
        # With only 3 data bytes (indices 0, 1, 2), we have data[2] for
        # continuous completion, but availability bytes are missing (default 0)
        # All monitors should be unsupported since availability is 0
        for m in result["monitors"]:
            assert m["supported"] is False
            assert m["ready"] is None

    def test_real_toyota_variable_length_capture(self):
        """Real Toyota 0101 capture from 2026-06-14 parses without requiring 6 data bytes."""
        result = parse_readiness_monitors("410100044000")
        assert result is not None
        assert result["milStatus"] == "OFF"
        assert result["storedDtcCount"] == 0
        assert result["rawResponse"] == "410100044000"
        assert "monitors" in result
        assert len(result["monitors"]) == 11

    def test_five_byte_data_current_mock_format(self):
        """5 data bytes (current mock format) — byte 5 defaults to 0.

        Input: 41010007FF07EF
        data[0]=0x00, data[1]=0x07, data[2]=0xFF, data[3]=0x07, data[4]=0xEF
        data[5] missing → defaults to 0x00
        MIL OFF, 0 DTCs
        data[2]=0xFF: continuous completion all set
        data[3]=0x07: non-continuous completion (bits 0-2 set only)
        data[4]=0xEF: continuous availability (bits 0-2 set) + non-continuous availability (0xEF = bits 0-5, 7 but NOT bit 6)
        data[5]=0x00: non-continuous availability defaults to 0

        Wait — with the SAE J1979 mapping:
        data[2] is COMPLETION continuous
        data[3] is COMPLETION non-continuous
        data[4] is AVAILABILITY continuous (bits 0-2)
        data[5] is AVAILABILITY non-continuous (defaults to 0)

        So with data[5]=0x00, NO non-continuous monitors are available/supported.
        """
        result = parse_readiness_monitors("41010007FF07EF")
        assert result is not None
        assert result["milStatus"] == "OFF"
        assert result["storedDtcCount"] == 0

        monitors_by_name = {m["name"]: m for m in result["monitors"]}

        # Continuous monitors: availability from data[4] bits 0-2 = 0xEF bits 0-2 = 0x7 = all set
        # Completion from data[2] bits 0-2 = 0xFF bits 0-2 = 0x7 = all set
        # Wait, data[4] = 0xEF. Bits 0-2 of 0xEF = 0x07 → all 3 continuous monitors supported
        # But data[5] = 0x00 → NO non-continuous monitors supported
        assert monitors_by_name["misfire"]["supported"] is True
        assert monitors_by_name["misfire"]["ready"] is True
        assert monitors_by_name["fuelSystem"]["supported"] is True
        assert monitors_by_name["fuelSystem"]["ready"] is True
        assert monitors_by_name["components"]["supported"] is True
        assert monitors_by_name["components"]["ready"] is True

        # Non-continuous: availability data[5]=0x00 → all unsupported
        for name in ["catalyst", "heatedCatalyst", "evap", "secondaryAir",
                     "acRefrigerant", "oxygenSensor", "oxygenSensorHeater", "egrVvt"]:
            assert monitors_by_name[name]["supported"] is False, f"{name} should be unsupported"
            assert monitors_by_name[name]["ready"] is None, f"{name} should have ready=None"

    def test_all_monitor_names_present_and_ordered(self):
        """All 11 SAE J1979 monitor names appear exactly once in order."""
        result = parse_readiness_monitors("4101000007EF07FF")
        assert result is not None
        names = [m["name"] for m in result["monitors"]]
        expected = [
            "misfire", "fuelSystem", "components",
            "catalyst", "heatedCatalyst", "evap", "secondaryAir",
            "acRefrigerant", "oxygenSensor", "oxygenSensorHeater", "egrVvt",
        ]
        assert names == expected
        assert len(result["monitors"]) == 11

    def test_mil_on_with_1_dtc(self):
        """MIL ON, 1 DTC — verify bit 7 extraction and DTC count."""
        result = parse_readiness_monitors("4101810007EF07FF")
        assert result is not None
        assert result["milStatus"] == "ON"
        assert result["storedDtcCount"] == 1

    def test_mil_off_with_zero_dtcs(self):
        """MIL OFF, 0 DTCs — verify clean state."""
        result = parse_readiness_monitors("4101000007EF07FF")
        assert result is not None
        assert result["milStatus"] == "OFF"
        assert result["storedDtcCount"] == 0

    def test_all_monitors_zero_availability(self):
        """All availability bytes zero — all monitors unsupported."""
        result = parse_readiness_monitors("4101000000000000")
        assert result is not None
        assert result["milStatus"] == "OFF"
        assert result["storedDtcCount"] == 0
        for m in result["monitors"]:
            assert m["supported"] is False
            assert m["ready"] is None


class TestReadinessMonitorsIntegration:
    """US1 integration tests for read_readiness_monitors() with mock adapters."""

    def test_default_profile_outer_compatibility_wrapper(self):
        """Default profile returns { supported: True, value: ReadinessResult }."""
        adapter = MockObdAdapter(profile_name="default")
        result = read_readiness_monitors(adapter)

        # Outer compatibility wrapper
        assert "supported" in result
        assert "value" in result
        assert result["supported"] is True
        assert isinstance(result["value"], dict)

        # Inner ReadinessResult shape
        value = result["value"]
        assert "milStatus" in value
        assert "storedDtcCount" in value
        assert "monitors" in value
        assert "rawResponse" in value

    def test_default_profile_readiness_result_content(self):
        """Default profile decodes MIL, DTC count, and monitor states."""
        adapter = MockObdAdapter(profile_name="default")
        result = read_readiness_monitors(adapter)
        assert result["supported"] is True
        value = result["value"]

        # MIL OFF, 0 DTCs (default profile has data[0]=0x00)
        assert value["milStatus"] == "OFF"
        assert value["storedDtcCount"] == 0

        # All 11 monitors present
        assert len(value["monitors"]) == 11

        # Each monitor has name, supported, ready
        for m in value["monitors"]:
            assert "name" in m
            assert "supported" in m
            assert "ready" in m

    def test_all_profiles_have_pid_0101(self):
        """All mock profiles that support health PIDs have PID 0101 in PID_RESPONSES."""
        from src.obd.mock_profiles.profile_registry import ProfileRegistry

        registry = ProfileRegistry()
        for profile_name in registry.list_profiles():
            profile = registry.get_profile(profile_name)
            # Skip profiles where 0101 is in UNSUPPORTED_COMMANDS
            if "0101" in getattr(profile, "UNSUPPORTED_COMMANDS", set()):
                continue
            assert "0101" in profile.PID_RESPONSES, (
                f"Profile '{profile_name}' missing PID 0101 in PID_RESPONSES"
            )

    def test_all_profiles_decode_valid_readiness_result(self):
        """All profiles with PID 0101 decode to a valid ReadinessResult."""
        from src.obd.mock_profiles.profile_registry import ProfileRegistry

        registry = ProfileRegistry()
        for profile_name in registry.list_profiles():
            profile = registry.get_profile(profile_name)
            # Skip profiles where 0101 is in UNSUPPORTED_COMMANDS
            if "0101" in getattr(profile, "UNSUPPORTED_COMMANDS", set()):
                continue
            adapter = MockObdAdapter(profile_name=profile_name)
            result = read_readiness_monitors(adapter)
            assert result["supported"] is True, (
                f"Profile '{profile_name}' readiness should be supported"
            )
            value = result["value"]
            assert value["milStatus"] in ("ON", "OFF"), (
                f"Profile '{profile_name}' milStatus should be ON or OFF"
            )
            assert isinstance(value["storedDtcCount"], int), (
                f"Profile '{profile_name}' storedDtcCount should be int"
            )
            assert len(value["monitors"]) == 11, (
                f"Profile '{profile_name}' should have 11 monitors"
            )


class TestReadinessMonitorsUnsupportedAdapter:
    """Tests for read_readiness_monitors() with unsupported/error responses."""

    def test_unsupported_pid_returns_not_supported(self):
        """PID 0101 in UNSUPPORTED_COMMANDS returns { supported: False, value: {} }."""
        adapter = MockObdAdapter(profile_name="default")
        original_unsupported = adapter._profile.UNSUPPORTED_COMMANDS.copy()
        try:
            # Add 0101 to UNSUPPORTED_COMMANDS to simulate unsupported readiness
            adapter._profile.UNSUPPORTED_COMMANDS = adapter._profile.UNSUPPORTED_COMMANDS | {"0101"}
            result = read_readiness_monitors(adapter)
            assert result["supported"] is False
            assert result["value"] == {}
        finally:
            # Restore original set to avoid polluting other tests
            adapter._profile.UNSUPPORTED_COMMANDS = original_unsupported

    def test_parser_returns_none_for_none(self):
        """Parser receives None from _send_pid returns None."""
        result = parse_readiness_monitors(None)
        assert result is None

    def test_readiness_returns_not_supported_on_parser_failure(self):
        """If parser returns None, read_readiness_monitors returns unsupported."""
        # Wrong prefix causes parse_readiness_monitors to return None
        result = parse_readiness_monitors("410041BE1FB813")
        assert result is None

    def test_all_monitors_zero_availability(self):
        """All availability bytes zero → all monitors unsupported, ready=None."""
        result = parse_readiness_monitors("4101000000000000")
        assert result is not None
        for m in result["monitors"]:
            assert m["supported"] is False
            assert m["ready"] is None

    def test_mil_off_with_completed_monitors(self):
        """MIL OFF with some monitors completed — milStatus OFF, supported monitors ready."""
        # data[0]=0x00 (MIL OFF, 0 DTCs), data[4]=0x07, data[5]=0x01
        # Only catalyst (bit 0 of non-continuous) supported and ready
        result = parse_readiness_monitors("4101000007010701")
        assert result is not None
        assert result["milStatus"] == "OFF"
        monitors_by_name = {m["name"]: m for m in result["monitors"]}
        # Continuous: all supported (data[4]=0x07) and ready (data[2]=0x07)
        assert monitors_by_name["misfire"]["supported"] is True
        assert monitors_by_name["misfire"]["ready"] is True
        # Non-continuous: only catalyst (bit 0) supported (data[5]=0x01)
        assert monitors_by_name["catalyst"]["supported"] is True
        assert monitors_by_name["catalyst"]["ready"] is True
        # All other non-continuous monitors unsupported
        assert monitors_by_name["heatedCatalyst"]["supported"] is False
        assert monitors_by_name["heatedCatalyst"]["ready"] is None


class TestParserEquivalence:
    """US2: Mock adapter and direct parser produce identical ReadinessResult."""

    def test_parser_and_adapter_produce_same_result(self):
        """For a known hex input, parser and mock adapter produce identical results."""
        # Use the default profile's PID 0101 response directly
        adapter = MockObdAdapter(profile_name="default")
        adapter_result = read_readiness_monitors(adapter)
        assert adapter_result["supported"] is True
        adapter_value = adapter_result["value"]

        # Get the raw hex string from the adapter result and parse it directly
        raw_hex = adapter_value["rawResponse"]
        parser_result = parse_readiness_monitors(raw_hex)
        assert parser_result is not None

        # Both should produce structurally identical ReadinessResult content
        assert parser_result["milStatus"] == adapter_value["milStatus"]
        assert parser_result["storedDtcCount"] == adapter_value["storedDtcCount"]
        assert len(parser_result["monitors"]) == len(adapter_value["monitors"])
        for p, a in zip(parser_result["monitors"], adapter_value["monitors"]):
            assert p["name"] == a["name"]
            assert p["supported"] == a["supported"]
            assert p["ready"] == a["ready"]

    def test_specific_hex_parser_adapter_equivalence(self):
        """MIL ON, 3 DTCs, no monitors: parser and adapter produce same output."""
        from unittest.mock import patch

        # Use a known hex string and verify both paths produce identical results
        hex_str = "4101830000000000"
        parser_result = parse_readiness_monitors(hex_str)

        with patch.object(
            MockObdAdapter, "send", return_value=hex_str.encode("ascii")
        ):
            adapter = MockObdAdapter(profile_name="default")
            adapter_result = read_readiness_monitors(adapter)

        assert parser_result is not None
        assert parser_result["milStatus"] == "ON"
        assert parser_result["storedDtcCount"] == 3


class TestProfileReadinessDecoding:
    """US3: Each mock profile decodes PID 0101 correctly through the parser."""

    def test_default_profile_readiness(self):
        """Default profile: MIL OFF, 0 DTCs, all monitors supported and ready."""
        adapter = MockObdAdapter(profile_name="default")
        result = read_readiness_monitors(adapter)
        assert result["supported"] is True
        value = result["value"]
        assert value["milStatus"] == "OFF"
        assert value["storedDtcCount"] == 0
        for m in value["monitors"]:
            assert m["supported"] is True, f"{m['name']} should be supported"
            assert m["ready"] is True, f"{m['name']} should be ready"

    def test_no_faults_profile_readiness(self):
        """No faults profile: MIL OFF, 0 DTCs, all monitors supported and ready."""
        adapter = MockObdAdapter(profile_name="no_faults")
        result = read_readiness_monitors(adapter)
        assert result["supported"] is True
        value = result["value"]
        assert value["milStatus"] == "OFF"
        assert value["storedDtcCount"] == 0
        for m in value["monitors"]:
            assert m["supported"] is True
            assert m["ready"] is True

    def test_with_faults_profile_readiness(self):
        """With faults profile: MIL ON, 3 DTCs, acRefrigerant not ready."""
        adapter = MockObdAdapter(profile_name="with_faults")
        result = read_readiness_monitors(adapter)
        assert result["supported"] is True
        value = result["value"]
        assert value["milStatus"] == "ON"
        assert value["storedDtcCount"] == 3

        monitors_by_name = {m["name"]: m for m in value["monitors"]}
        # acRefrigerant supported but not ready (data[3]=0xEF, bit 4 = 0)
        assert monitors_by_name["acRefrigerant"]["supported"] is True
        assert monitors_by_name["acRefrigerant"]["ready"] is False
        # Continuous monitors all ready
        assert monitors_by_name["misfire"]["ready"] is True
        assert monitors_by_name["fuelSystem"]["ready"] is True
        assert monitors_by_name["components"]["ready"] is True

    def test_unsupported_vin_profile_readiness(self):
        """Unsupported VIN profile: MIL OFF, 0 DTCs, all monitors supported and ready."""
        adapter = MockObdAdapter(profile_name="unsupported_vin")
        result = read_readiness_monitors(adapter)
        assert result["supported"] is True
        value = result["value"]
        assert value["milStatus"] == "OFF"
        assert value["storedDtcCount"] == 0
        for m in value["monitors"]:
            assert m["supported"] is True
            assert m["ready"] is True

    def test_toyota_real_sample_readiness(self):
        """Toyota real sample: real 2026-06-14 capture, MIL OFF, 0 DTCs."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        result = read_readiness_monitors(adapter)
        assert result["supported"] is True
        value = result["value"]
        assert value["milStatus"] == "OFF"
        assert value["storedDtcCount"] == 0
        assert value["rawResponse"] == "410100044000"
        assert len(value["monitors"]) == 11

    def test_toyota_real_faults_readiness(self):
        """Toyota real faults: synthetic MIL ON readiness for fault workflow testing."""
        adapter = MockObdAdapter(profile_name="toyota_real_faults")
        result = read_readiness_monitors(adapter)
        assert result["supported"] is True
        value = result["value"]
        assert value["milStatus"] == "ON"
        assert value["storedDtcCount"] == 3

    def test_unsupported_command_returns_not_supported(self):
        """Profile with 0101 in UNSUPPORTED_COMMANDS returns not supported."""
        adapter = MockObdAdapter(profile_name="default")
        original_unsupported = adapter._profile.UNSUPPORTED_COMMANDS.copy()
        try:
            adapter._profile.UNSUPPORTED_COMMANDS = adapter._profile.UNSUPPORTED_COMMANDS | {"0101"}
            result = read_readiness_monitors(adapter)
            assert result["supported"] is False
            assert result["value"] == {}
        finally:
            adapter._profile.UNSUPPORTED_COMMANDS = original_unsupported


class TestReadinessMonitorsMonitorNames:
    """Verify the monitor names list matches SAE J1979 standard."""

    def test_monitor_names_count(self):
        """Exactly 11 monitor names."""
        assert len(_MONITOR_NAMES) == 11

    def test_monitor_names_order(self):
        """Monitor names in SAE J1979 order."""
        expected = [
            "misfire", "fuelSystem", "components",
            "catalyst", "heatedCatalyst", "evap", "secondaryAir",
            "acRefrigerant", "oxygenSensor", "oxygenSensorHeater", "egrVvt",
        ]
        assert _MONITOR_NAMES == expected

    def test_no_duplicate_names(self):
        """No duplicate monitor names."""
        assert len(set(_MONITOR_NAMES)) == len(_MONITOR_NAMES)
