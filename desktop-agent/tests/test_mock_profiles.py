"""Tests for mock vehicle profile system.

Covers profile registry, profile selection, fallback behavior,
individual profile content, DTC responses, VIN handling, and
backward compatibility with existing MockObdAdapter behavior.
"""

import os
from unittest.mock import patch

import pytest

from src.obd.mock_adapter import MockObdAdapter
from src.obd.mock_profiles.profile_registry import ProfileRegistry


# ============================================================================
# Profile Registry Tests (US1)
# ============================================================================


class TestProfileRegistry:
    """Tests for ProfileRegistry loading, validation, and fallback."""

    def test_list_profiles_returns_all_six(self):
        """All 6 profile names are listed."""
        registry = ProfileRegistry()
        profiles = registry.list_profiles()
        assert sorted(profiles) == [
            "default",
            "no_faults",
            "toyota_real_faults",
            "toyota_real_sample",
            "unsupported_vin",
            "with_faults",
        ]

    def test_get_profile_existing_name(self):
        """Existing profile name returns the correct module."""
        registry = ProfileRegistry()
        profile = registry.get_profile("toyota_real_sample")
        assert profile.PROFILE_NAME == "toyota_real_sample"

    def test_get_profile_nonexistent_falls_back_to_default(self):
        """Nonexistent profile name falls back to 'default' with a warning."""
        registry = ProfileRegistry()
        profile = registry.get_profile("nonexistent_profile")
        assert profile.PROFILE_NAME == "default"

    def test_get_profile_default_explicit(self):
        """Explicit 'default' profile name returns the default module."""
        registry = ProfileRegistry()
        profile = registry.get_profile("default")
        assert profile.PROFILE_NAME == "default"

    def test_get_profile_caches_result(self):
        """Same profile name returns the same cached module."""
        registry = ProfileRegistry()
        profile1 = registry.get_profile("default")
        profile2 = registry.get_profile("default")
        assert profile1 is profile2


class TestProfileSelectionViaConfig:
    """Tests for profile selection via OBD_MOCK_PROFILE config."""

    def test_default_profile_when_no_env_var(self):
        """MockObdAdapter without explicit profile uses config default."""
        with patch.dict(os.environ, {"OBD_MOCK_PROFILE": "default"}, clear=False):
            adapter = MockObdAdapter()
            # Should work without error using default profile
            assert adapter.send("0100") == b"4100BE1FB820"

    def test_toyota_real_sample_profile_selection(self):
        """MockObdAdapter with toyota_real_sample returns Toyota data."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        # RPM: 010C → 410C0E10 = 900 RPM
        assert adapter.send("010C") == b"410C0E10"
        # Coolant: 0105 → 41057E = 86°C
        assert adapter.send("0105") == b"41057E"

    def test_no_faults_profile_selection(self):
        """MockObdAdapter with no_faults returns clean vehicle data."""
        adapter = MockObdAdapter(profile_name="no_faults")
        assert adapter.send("0104") is not None  # Engine load supported
        assert adapter.fault_metadata == {}

    def test_with_faults_profile_selection(self):
        """MockObdAdapter with with_faults returns fault metadata."""
        adapter = MockObdAdapter(profile_name="with_faults")
        assert "P0301" in adapter.fault_metadata
        assert adapter.fault_metadata["P0301"]["status"] == "ACTIVE"

    def test_unsupported_vin_profile_selection(self):
        """MockObdAdapter with unsupported_vin returns all-FF VIN."""
        adapter = MockObdAdapter(profile_name="unsupported_vin")
        vin_response = adapter.send("0902")
        # Response is ASCII hex string starting with "4902"
        assert vin_response.startswith(b"4902")


# ============================================================================
# Toyota Real Sample Profile Tests (US1)
# ============================================================================


class TestToyotaRealSampleProfile:
    """Tests for the toyota_real_sample profile content."""

    def setup_method(self):
        self.adapter = MockObdAdapter(profile_name="toyota_real_sample")

    def test_rpm_returns_900(self):
        """RPM response decodes to 900 RPM."""
        assert self.adapter.send("010C") == b"410C0E10"

    def test_speed_returns_0(self):
        """Speed response decodes to 0 km/h."""
        assert self.adapter.send("010D") == b"410D00"

    def test_coolant_returns_86(self):
        """Coolant response decodes to 86°C."""
        assert self.adapter.send("0105") == b"41057E"

    def test_engine_load_returns_46_percent(self):
        """Engine load response decodes to ~46.3%."""
        assert self.adapter.send("0104") == b"410476"

    def test_voltage_returns_13_417(self):
        """Voltage response decodes to 13.417V."""
        assert self.adapter.send("0142") == b"41423469"

    def test_fuel_level_unsupported(self):
        """Fuel level PID returns empty bytes (unsupported)."""
        assert self.adapter.send("012F") == b""

    def test_vin_unsupported(self):
        """VIN returns all-FF payload (unsupported)."""
        response = self.adapter.send("0902")
        # ASCII hex response starts with "4902"
        assert response.startswith(b"4902")
        # After "4902", the remaining hex chars should be all "FF"
        data_hex = response[4:].decode("ascii")
        assert all(c == "F" for c in data_hex)

    def test_supported_pids_mask(self):
        """Supported PID mask matches captured data."""
        assert self.adapter.send("0100") == b"4100BE1FB813"

    def test_no_fault_metadata(self):
        """Toyota real sample has no fault metadata."""
        assert self.adapter.fault_metadata == {}

    def test_no_dtc_codes(self):
        """DTC scan returns zero codes (no faults)."""
        assert self.adapter.send("03") == b"4300"
        assert self.adapter.send("07") == b"4700"
        assert self.adapter.send("0A") == b"4A00"


# ============================================================================
# DTC Fault Code Profile Tests (US2)
# ============================================================================


class TestWithFaultsProfile:
    """Tests for the with_faults profile."""

    def setup_method(self):
        self.adapter = MockObdAdapter(profile_name="with_faults")

    def test_dtc_mode_03_returns_fault_codes(self):
        """Mode 03 response contains P0301 and P0171."""
        assert self.adapter.send("03") == b"43020301C100"

    def test_dtc_mode_07_returns_pending(self):
        """Mode 07 response contains P0171."""
        assert self.adapter.send("07") == b"47010171"

    def test_dtc_mode_0a_returns_no_permanent(self):
        """Mode 0A response has no permanent DTCs."""
        assert self.adapter.send("0A") == b"4A00"

    def test_fault_metadata_contains_three_codes(self):
        """Fault metadata has P0301, P0171, U0100."""
        metadata = self.adapter.fault_metadata
        assert "P0301" in metadata
        assert "P0171" in metadata
        assert "U0100" in metadata
        assert metadata["P0301"]["status"] == "ACTIVE"
        assert metadata["P0301"]["ecu"] == "ECM"
        assert metadata["P0171"]["status"] == "PENDING"
        assert metadata["U0100"]["status"] == "ACTIVE"
        assert metadata["U0100"]["ecu"] == "TCM"

    def test_valid_vin(self):
        """With_faults profile has a valid VIN."""
        response = self.adapter.send("0902")
        assert response.startswith(b"4902")

    def test_clear_dtc_sets_flag(self):
        """Mode 04 sets dtcs_cleared flag."""
        self.adapter.send("04")
        assert self.adapter._dtcs_cleared is True
        # After clear, DTC modes return zero codes
        assert self.adapter.send("03") == b"4300"


class TestNoFaultsProfile:
    """Tests for the no_faults profile."""

    def setup_method(self):
        self.adapter = MockObdAdapter(profile_name="no_faults")

    def test_dtc_returns_zero_codes(self):
        """All DTC modes return zero-code responses."""
        assert self.adapter.send("03") == b"4300"
        assert self.adapter.send("07") == b"4700"
        assert self.adapter.send("0A") == b"4A00"

    def test_no_fault_metadata(self):
        """No faults means empty fault metadata."""
        assert self.adapter.fault_metadata == {}

    def test_valid_vin(self):
        """No_faults profile has a valid VIN."""
        response = self.adapter.send("0902")
        assert response.startswith(b"4902")
        # Should be a 17-char VIN
        from src.obd.commands.vin import _read_vin_mock
        result = _read_vin_mock(response)
        assert result.status == "SUPPORTED"
        assert len(result.vin) == 17


class TestToyotaRealFaultsProfile:
    """Tests for the toyota_real_faults profile."""

    def setup_method(self):
        self.adapter = MockObdAdapter(profile_name="toyota_real_faults")

    def test_health_pids_match_toyota_real_sample(self):
        """Vehicle health PIDs are identical to toyota_real_sample."""
        toyota = MockObdAdapter(profile_name="toyota_real_sample")
        for pid in ["0100", "0104", "0105", "010C", "010D", "0142"]:
            assert self.adapter.send(pid) == toyota.send(pid), (
                f"PID {pid} differs between toyota_real_faults and toyota_real_sample"
            )

    def test_dtc_responses_match_with_faults(self):
        """DTC responses contain the same fault codes as with_faults."""
        assert self.adapter.send("03") == b"43020301C100"

    def test_fault_metadata_matches_with_faults(self):
        """Fault metadata is identical to with_faults."""
        with_faults = MockObdAdapter(profile_name="with_faults")
        assert self.adapter.fault_metadata == with_faults.fault_metadata

    def test_vin_unsupported(self):
        """VIN is unsupported (same as toyota_real_sample)."""
        response = self.adapter.send("0902")
        assert response.startswith(b"4902")

    def test_fuel_level_unsupported(self):
        """Fuel level is unsupported (same as toyota_real_sample)."""
        assert self.adapter.send("012F") == b""


# ============================================================================
# Unsupported VIN Profile Tests (US3)
# ============================================================================


class TestUnsupportedVinProfile:
    """Tests for the unsupported_vin profile."""

    def setup_method(self):
        self.adapter = MockObdAdapter(profile_name="unsupported_vin")

    def test_vin_response_is_all_ff(self):
        """VIN response is the all-FF payload."""
        response = self.adapter.send("0902")
        # ASCII hex response starts with "4902"
        assert response.startswith(b"4902")
        # After "4902", the remaining hex chars should be all "FF"
        data_hex = response[4:].decode("ascii")
        assert all(c == "F" for c in data_hex)

    def test_health_pids_return_valid_data(self):
        """Health PIDs return valid raw ECU responses."""
        assert self.adapter.send("0100") is not None
        assert self.adapter.send("0104") is not None
        assert self.adapter.send("0142") is not None

    def test_no_fault_metadata(self):
        """No fault codes in unsupported_vin profile."""
        assert self.adapter.fault_metadata == {}


class TestVinAllFFHandling:
    """Tests for vin.py all-FF payload detection using VinResult."""

    def test_all_ff_vin_returns_unsupported(self):
        """_read_vin_mock returns VinResult.unsupported(ALL_FF) for all-FF payload."""
        from src.obd.commands.vin import _read_vin_mock

        # All-FF VIN as ASCII hex string (what mock adapter returns)
        all_ff_response = b"4902" + b"FF" * 17
        result = _read_vin_mock(all_ff_response)
        assert result.status == "UNSUPPORTED"
        assert result.reason == "ALL_FF"
        assert result.vin is None

    def test_no_faults_vin_decodes_correctly(self):
        """_read_vin_mock decodes a valid VIN from no_faults profile."""
        from src.obd.commands.vin import _read_vin_mock

        # JTDBR32E720123456 as ASCII hex VIN response
        vin_response = b"49024A54444252333245373230313233343536"
        result = _read_vin_mock(vin_response)
        assert result.status == "SUPPORTED"
        assert result.vin == "JTDBR32E720123456"

    def test_default_vin_decodes_correctly(self):
        """_read_vin_mock decodes the default profile VIN."""
        from src.obd.commands.vin import _read_vin_mock

        vin_response = b"490257314B4146344742315246313234333231"
        result = _read_vin_mock(vin_response)
        assert result.status == "SUPPORTED"
        assert result.vin == "W1KAF4GB1RF124321"


class TestVinResultUnsupported:
    """Tests for read_vin returning VinResult.unsupported for various profiles."""

    def test_toyota_real_sample_vin_unsupported(self):
        """Toyota real sample profile returns VinResult.unsupported(ALL_FF)."""
        from src.obd.commands.vin import read_vin

        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        result = read_vin(adapter)
        assert result.status == "UNSUPPORTED"
        assert result.reason == "ALL_FF"
        assert result.vin is None

    def test_toyota_real_faults_vin_unsupported(self):
        """Toyota real faults profile returns VinResult.unsupported(ALL_FF)."""
        from src.obd.commands.vin import read_vin

        adapter = MockObdAdapter(profile_name="toyota_real_faults")
        result = read_vin(adapter)
        assert result.status == "UNSUPPORTED"
        assert result.reason == "ALL_FF"
        assert result.vin is None

    def test_unsupported_vin_profile_returns_unsupported(self):
        """Unsupported VIN profile returns VinResult.unsupported(ALL_FF)."""
        from src.obd.commands.vin import read_vin

        adapter = MockObdAdapter(profile_name="unsupported_vin")
        result = read_vin(adapter)
        assert result.status == "UNSUPPORTED"
        assert result.reason == "ALL_FF"
        assert result.vin is None

    def test_empty_response_returns_unsupported_empty(self):
        """Empty adapter response returns VinResult.unsupported(EMPTY_RESPONSE)."""
        from src.obd.commands.vin import _read_vin_mock

        result = _read_vin_mock(b"")
        assert result.status == "UNSUPPORTED"
        assert result.reason == "EMPTY_RESPONSE"
        assert result.vin is None


# ============================================================================
# Backward Compatibility Tests (All Stories)
# ============================================================================


class TestBackwardCompatibility:
    """Tests that existing behavior is preserved when using default profile."""

    def test_default_profile_matches_original_mock_adapter(self):
        """Default profile reproduces original MockObdAdapter responses exactly."""
        adapter = MockObdAdapter(profile_name="default")

        # VIN
        assert adapter.send("0902") == b"490257314B4146344742315246313234333231"

        # DTC modes
        assert adapter.send("03") == b"43020301C100"
        assert adapter.send("07") == b"47010171"
        assert adapter.send("0A") == b"4A00"

        # Health PIDs
        assert adapter.send("0101") == b"41010007FF07EF"
        assert adapter.send("0103") == b"41030200"
        assert adapter.send("0104") == b"410480"
        assert adapter.send("012F") == b"412FCC"
        assert adapter.send("0131") == b"41312710"
        assert adapter.send("0142") == b"414236D4"
        assert adapter.send("0100") == b"4100BE1FB820"
        assert adapter.send("0120") == b"412081008402"
        assert adapter.send("0900") == b"490002000000"

        # Clear DTC
        assert adapter.send("04") == b"44"

    def test_default_fault_metadata(self):
        """Default profile has the original fault metadata."""
        adapter = MockObdAdapter(profile_name="default")
        assert adapter.fault_metadata == {
            "P0301": {"status": "ACTIVE", "ecu": "ECM"},
            "P0171": {"status": "PENDING", "ecu": "ECM"},
            "U0100": {"status": "ACTIVE", "ecu": "TCM"},
        }

    def test_dtc_clear_behavior_preserved(self):
        """After Mode 04, DTC modes return zero codes (same as before)."""
        adapter = MockObdAdapter(profile_name="default")
        adapter.send("04")  # Clear DTCs
        assert adapter.send("03") == b"4300"
        assert adapter.send("07") == b"4700"
        assert adapter.send("0A") == b"4A00"

    def test_unknown_command_returns_empty(self):
        """Unknown PID returns empty bytes (same as before)."""
        adapter = MockObdAdapter(profile_name="default")
        assert adapter.send("9999") == b""

    def test_adapter_type_and_protocol(self):
        """adapter_type and protocol remain 'MOCK'."""
        adapter = MockObdAdapter(profile_name="default")
        assert adapter.adapter_type == "MOCK"
        assert adapter.protocol == "MOCK"

    def test_connect_and_is_connected(self):
        """connect() and is_connected() still return True."""
        adapter = MockObdAdapter(profile_name="default")
        assert adapter.connect() is True
        assert adapter.is_connected() is True


class TestParserCodePath:
    """Tests that same parser code executes for mock and real paths (SC-010)."""

    def test_vehicle_data_parser_works_with_mock_profile(self):
        """Vehicle data parsers decode mock profile bytes identically to real."""
        from src.obd.commands.vehicle_data import (
            read_battery_voltage,
            read_engine_load,
            read_fuel_level,
        )

        # Create a mock adapter with no_faults profile
        adapter = MockObdAdapter(profile_name="no_faults")

        # These use the same parser code as real vehicle data
        voltage = read_battery_voltage(adapter)
        assert voltage["supported"] is True
        # (0x36*256 + 0xD4)/1000 = 14036/1000 = 14.036 → rounds to 14.0
        assert voltage["value"] == 14.0

        load = read_engine_load(adapter)
        assert load["supported"] is True
        assert load["value"] == 50.2

        fuel = read_fuel_level(adapter)
        assert fuel["supported"] is True
        assert fuel["value"] == 80.0

    def test_toyota_real_sample_parser_values(self):
        """Toyota real sample raw bytes decode to correct values."""
        from src.obd.commands.vehicle_data import (
            read_battery_voltage,
            read_engine_load,
        )

        adapter = MockObdAdapter(profile_name="toyota_real_sample")

        # Voltage: (0x34*256 + 0x69)/1000 = 13417/1000 = 13.417 → rounds to 13.4
        voltage = read_battery_voltage(adapter)
        assert voltage["supported"] is True
        assert voltage["value"] == 13.4

        # Engine load: 0x76 * 100 / 255 = 46.27... → rounds to 46.3%
        load = read_engine_load(adapter)
        assert load["supported"] is True
        assert load["value"] == 46.3

    def test_fuel_level_unsupported_returns_not_supported(self):
        """Toyota real sample returns unsupported for fuel level."""
        from src.obd.commands.vehicle_data import read_fuel_level

        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        fuel = read_fuel_level(adapter)
        assert fuel["supported"] is False
        assert fuel["value"] is None