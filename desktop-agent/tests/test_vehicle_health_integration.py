"""Tests for Vehicle Health read integration.

Covers: SC-009 (Toyota regression), AC #10 (health read tests),
FR-007 (supported-but-unavailable), FR-008 (VIN unsupported),
FR-012 (raw OBD response inclusion).
"""

import pytest

from src.obd.mock_adapter import MockObdAdapter
from src.obd.commands.vehicle_data import (
    read_vehicle_health,
    read_rpm,
    read_coolant_temperature,
    read_vehicle_speed,
    read_battery_voltage,
    read_engine_load,
    read_fuel_level,
    read_freeze_frame,
)
from src.obd.commands.vin import read_vin, VIN_UNSUPPORTED


class TestToyotaVehicleHealth:
    """Toyota real sample profile returns expected decoded values."""

    def setup_method(self):
        self.adapter = MockObdAdapter(profile_name="toyota_real_sample")
        self.health = read_vehicle_health(self.adapter)

    def test_rpm_900(self):
        assert self.health["rpm"]["value"] == 900.0
        assert self.health["rpm"]["supported"] is True
        assert self.health["rpm"]["available"] is True
        assert self.health["rpm"]["pid"] == "0C"
        assert self.health["rpm"]["unit"] == "RPM"

    def test_speed_0(self):
        assert self.health["vehicleSpeed"]["value"] == 0.0
        assert self.health["vehicleSpeed"]["supported"] is True
        assert self.health["vehicleSpeed"]["available"] is True

    def test_coolant_86(self):
        assert self.health["coolantTemperature"]["value"] == 86.0
        assert self.health["coolantTemperature"]["supported"] is True
        assert self.health["coolantTemperature"]["available"] is True

    def test_engine_load_46_3(self):
        assert self.health["calculatedEngineLoad"]["value"] == 46.3
        assert self.health["calculatedEngineLoad"]["supported"] is True
        assert self.health["calculatedEngineLoad"]["available"] is True

    def test_voltage_13_417(self):
        assert self.health["batteryVoltage"]["value"] == 13.417
        assert self.health["batteryVoltage"]["supported"] is True
        assert self.health["batteryVoltage"]["available"] is True

    def test_fuel_level_unsupported(self):
        assert self.health["fuelLevel"]["supported"] is False
        assert self.health["fuelLevel"]["available"] is False
        assert self.health["fuelLevel"]["value"] is None
        assert self.health["fuelLevel"]["pid"] == "2F"

    def test_supported_health_pids_list(self):
        """supportedHealthPids contains 04, 05, 0C, 0D, 42."""
        expected = {"04", "05", "0C", "0D", "42"}
        assert set(self.health["supportedHealthPids"]) == expected

    def test_unsupported_health_pids_list(self):
        """unsupportedHealthPids contains 2F."""
        assert "2F" in self.health["unsupportedHealthPids"]
        assert len(self.health["unsupportedHealthPids"]) == 1


class TestPromptTerminatedHealthResponses:
    """Real ELM responses ending with '>' parse as normal PID data."""

    class PromptAdapter:
        protocol = "ELM327"
        adapter_type = "ELM327_WIFI"

        def __init__(self):
            self.responses = {
                "010C": b"410C0E10\r\r>",
                "0105": b"41057E\r\r>",
                "0142": b"41423469\r\r>",
            }

        def send(self, command: str) -> bytes:
            return self.responses.get(command, b"")

    def test_rpm_prompt_response(self):
        assert read_rpm(self.PromptAdapter())["value"] == 900.0

    def test_coolant_prompt_response(self):
        assert read_coolant_temperature(self.PromptAdapter())["value"] == 86.0

    def test_voltage_prompt_response(self):
        assert read_battery_voltage(self.PromptAdapter())["value"] == 13.417


class TestVinUnsupportedContinuation:
    """VIN unsupported does not fail the vehicle health read."""

    def test_toyota_vin_unsupported_health_succeeds(self):
        """Toyota real sample: VIN unsupported, health read completes."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        health = read_vehicle_health(adapter)
        vin_result = read_vin(adapter)

        # VIN is unsupported
        assert vin_result.status == VIN_UNSUPPORTED
        # Health read completed with all supported PIDs
        assert health["rpm"]["value"] == 900.0
        assert health["batteryVoltage"]["value"] == 13.417

    def test_unsupported_vin_profile_health_succeeds(self):
        """Unsupported VIN profile: health read still succeeds."""
        adapter = MockObdAdapter(profile_name="unsupported_vin")
        health = read_vehicle_health(adapter)
        vin_result = read_vin(adapter)

        assert vin_result.status == VIN_UNSUPPORTED
        # Health read completed
        assert "rpm" in health
        assert "batteryVoltage" in health


class TestSupportedButUnavailable:
    """A supported PID returning NO DATA is classified as unavailable."""

    def test_supported_pid_no_data(self):
        """PID in bitmap but returns NO DATA → supported: true, available: false.

        Uses read_vehicle_health() which has discovery context — it knows
        the PID was in the bitmap, so it overrides the reader's unsupported
        result to supported-but-unavailable.
        """
        # Create a custom mock where RPM (0C) is in 0100 bitmap but returns NO DATA
        class SelectiveMock:
            def send(self, cmd: str) -> bytes:
                if cmd == "0100":
                    # Bitmap with PID 0C supported.
                    # PID 0C = decimal 12, bit index 11 (bit 0 = PID 01).
                    # In 32-bit MSB-first mask: bit 11 → 1 << (31-11) = 1 << 20 = 0x00100000
                    # Full 4-byte bitmap: 00 10 00 00
                    return b"410000100000"
                if cmd == "010C":
                    return b""  # NO DATA
                return b""
            protocol = "MOCK"
            adapter_type = "MOCK"

        adapter = SelectiveMock()
        health = read_vehicle_health(adapter)

        # RPM is in the bitmap but returned NO DATA → supported: true, available: false
        assert health["rpm"]["supported"] is True
        assert health["rpm"]["available"] is False
        assert health["rpm"]["value"] is None
        # PID 0C should still be in supportedHealthPids (discovered in bitmap)
        assert "0C" in health["supportedHealthPids"]


class TestRawResponseInclusion:
    """T019: Successfully read PIDs include rawResponse, unsupported have null."""

    def test_raw_response_present_on_success(self):
        """Successfully decoded PID includes rawResponse hex string."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        health = read_vehicle_health(adapter)

        assert health["rpm"]["rawResponse"] == "410C0E10"
        assert health["batteryVoltage"]["rawResponse"] == "41423469"

    def test_raw_response_null_on_unsupported(self):
        """Unsupported PIDs have rawResponse: null."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        health = read_vehicle_health(adapter)

        assert health["fuelLevel"]["rawResponse"] is None


class TestDiscoveryFallback:
    """When 0100 fails, all configured PIDs are attempted."""

    def test_no_bitmap_fallback_all_pids_attempted(self):
        """When adapter returns nothing for 0100, all health PIDs are in supportedHealthPids."""
        class EmptyAdapter:
            def send(self, cmd: str) -> bytes:
                # Only respond to health PID commands, not bitmap discovery
                responses = {
                    "0104": b"410476",
                    "0105": b"41057E",
                    "010C": b"410C0E10",
                    "010D": b"410D00",
                    "0142": b"41423469",
                }
                return responses.get(cmd, b"")
            protocol = "MOCK"
            adapter_type = "MOCK"

        adapter = EmptyAdapter()
        health = read_vehicle_health(adapter)

        # All PIDs should be in supportedHealthPids (fallback mode)
        assert "04" in health["supportedHealthPids"]
        assert "0C" in health["supportedHealthPids"]
        assert "42" in health["supportedHealthPids"]


class TestHealthPidResultShape:
    """HealthPidResult three-state model is correct."""

    def test_supported_and_available(self):
        """Supported and available: all fields present, value is a number."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        rpm = read_rpm(adapter)
        assert rpm["supported"] is True
        assert rpm["available"] is True
        assert rpm["value"] is not None
        assert "pid" in rpm
        assert "unit" in rpm
        assert "rawResponse" in rpm

    def test_unsupported_never_available(self):
        """Unsupported: available is always false."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        fuel = read_fuel_level(adapter)
        assert fuel["supported"] is False
        assert fuel["available"] is False
        assert fuel["value"] is None


class TestFreezeFrameIntegration:
    """Integration tests for freezeFrame in VEHICLE_DATA_READ payload."""

    def test_default_profile_freeze_frame_available(self):
        """Default profile returns freeze frame with decoded values."""
        adapter = MockObdAdapter(profile_name="default")
        result = read_freeze_frame(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"]["dtc"] == "P0103"
        assert result["value"]["rpm"] == 2450.0
        assert result["value"]["speed"] == 72

    def test_with_faults_profile_freeze_frame_available(self):
        """With-faults profile returns freeze frame with decoded values."""
        adapter = MockObdAdapter(profile_name="with_faults")
        result = read_freeze_frame(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"]["dtc"] == "P0301"

    def test_no_faults_profile_freeze_frame_unavailable(self):
        """No-faults profile returns supported but unavailable."""
        adapter = MockObdAdapter(profile_name="no_faults")
        result = read_freeze_frame(adapter)
        assert result["supported"] is True
        assert result["available"] is False
        assert result["value"] == {}

    def test_unsupported_vin_profile_freeze_frame_unsupported(self):
        """Unsupported VIN profile returns unsupported for freeze frame."""
        adapter = MockObdAdapter(profile_name="unsupported_vin")
        result = read_freeze_frame(adapter)
        assert result["supported"] is False
        assert result["available"] is False
        assert result["value"] == {}

    def test_toyota_real_sample_freeze_frame(self):
        """Toyota real sample profile returns freeze frame (placeholder)."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        result = read_freeze_frame(adapter)
        # Toyota sample has DTC P0000 (no faults) → supported but unavailable
        assert result["supported"] is True
        assert result["available"] is False

    def test_toyota_real_faults_freeze_frame(self):
        """Toyota real faults profile returns freeze frame (placeholder)."""
        adapter = MockObdAdapter(profile_name="toyota_real_faults")
        result = read_freeze_frame(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"]["dtc"] == "P0301"

    def test_freeze_frame_no_exception_any_profile(self):
        """Freeze frame read never raises exceptions for any profile."""
        for profile_name in ["default", "with_faults", "no_faults", "unsupported_vin",
                              "toyota_real_sample", "toyota_real_faults"]:
            adapter = MockObdAdapter(profile_name=profile_name)
            result = read_freeze_frame(adapter)
            assert isinstance(result, dict)
            assert "supported" in result
            assert "available" in result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
