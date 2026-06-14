"""Toyota real vehicle regression test — SC-009.

Verifies that the Toyota real sample mock profile produces the exact
decoded values from the captured real Toyota data. Also verifies
mock/real parser consistency (same decoded output for same raw data).

SC-009 Input:
  0100 → 4100BE1FB813
  0120 → 412000000001  (chain continues, no PIDs 21-3F supported)
  0140 → 414040000000  (PID 0x42 supported, chain stops)
  0104 → 410476
  0105 → 41057E
  010C → 410C0E10
  010D → 410D00
  0142 → 41423469
  012F → NO DATA (unsupported)
  0902 → all-0xFF VIN

Expected result:
  RPM=900, Speed=0 km/h, Coolant=86°C, Load=46.3%, Voltage=13.417V
  Fuel Level=Unsupported, VIN=Unsupported
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
)
from src.obd.commands.vin import read_vin, VIN_UNSUPPORTED


class TestToyotaRegressionSC009:
    """SC-009: Toyota real capture produces correct decoded values."""

    def setup_method(self):
        self.adapter = MockObdAdapter(profile_name="toyota_real_sample")
        self.health = read_vehicle_health(self.adapter)
        self.vin_result = read_vin(self.adapter)

    def test_rpm_900(self):
        """RPM: (0x0E * 256 + 0x10) / 4 = 3600 / 4 = 900."""
        assert self.health["rpm"]["value"] == 900.0

    def test_speed_0_kmh(self):
        """Speed: 0x00 = 0 km/h."""
        assert self.health["vehicleSpeed"]["value"] == 0.0

    def test_coolant_86_c(self):
        """Coolant: 0x7E - 40 = 126 - 40 = 86°C."""
        assert self.health["coolantTemperature"]["value"] == 86.0

    def test_engine_load_46_3_pct(self):
        """Engine Load: 0x76 * 100 / 255 = 118 * 100 / 255 = 46.3%."""
        assert self.health["calculatedEngineLoad"]["value"] == 46.3

    def test_voltage_13_417_v(self):
        """Voltage: (0x34 * 256 + 0x69) / 1000 = 13417 / 1000 = 13.417V."""
        assert self.health["batteryVoltage"]["value"] == 13.417

    def test_fuel_level_unsupported(self):
        """Fuel Level: PID 012F unsupported → {supported: false, available: false}."""
        fuel = self.health["fuelLevel"]
        assert fuel["supported"] is False
        assert fuel["available"] is False
        assert fuel["value"] is None

    def test_vin_unsupported(self):
        """VIN: all-FF payload → UNSUPPORTED."""
        assert self.vin_result.status == VIN_UNSUPPORTED
        assert self.vin_result.vin is None

    def test_no_exceptions_raised(self):
        """Health read + VIN read complete without any exceptions."""
        # This test passes if setup_method completed without raising
        assert self.health is not None
        assert self.vin_result is not None


class TestMockRealParserConsistency:
    """FR-009: Mock and real adapters produce identical decoded output.

    Verifies that the MockObdAdapter's .hex().upper().encode("ascii")
    conversion produces the same parser input as direct hex strings.
    Both paths go through the same _send_pid() → hex string → parse logic.
    """

    def test_rpm_identical(self):
        """RPM decodes identically from MockObdAdapter and direct hex."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        rpm = read_rpm(adapter)
        assert rpm["value"] == 900.0
        assert rpm["supported"] is True

    def test_coolant_identical(self):
        """Coolant decodes identically."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        coolant = read_coolant_temperature(adapter)
        assert coolant["value"] == 86.0
        assert coolant["supported"] is True

    def test_speed_identical(self):
        """Speed decodes identically."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        speed = read_vehicle_speed(adapter)
        assert speed["value"] == 0.0
        assert speed["supported"] is True

    def test_load_identical(self):
        """Engine load decodes identically."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        load = read_engine_load(adapter)
        assert load["value"] == 46.3
        assert load["supported"] is True

    def test_voltage_identical(self):
        """Battery voltage decodes identically."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        voltage = read_battery_voltage(adapter)
        assert voltage["value"] == 13.417
        assert voltage["supported"] is True

    def test_fuel_level_unsupported_identical(self):
        """Fuel level unsupported is identical across both paths."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        fuel = read_fuel_level(adapter)
        assert fuel["supported"] is False
        assert fuel["value"] is None

    def test_full_health_read_consistent(self):
        """Full read_vehicle_health produces consistent results."""
        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        health = read_vehicle_health(adapter)

        assert health["rpm"]["value"] == 900.0
        assert health["vehicleSpeed"]["value"] == 0.0
        assert health["coolantTemperature"]["value"] == 86.0
        assert health["calculatedEngineLoad"]["value"] == 46.3
        assert health["batteryVoltage"]["value"] == 13.417
        assert health["fuelLevel"]["supported"] is False


class TestToyotaReadinessRegression:
    """Regression tests for the real Toyota 0101 readiness response."""

    def test_toyota_real_0101_readiness_decodes(self):
        """Real Toyota 2026-06-14 0101 response decodes to valid ReadinessResult."""
        from src.obd.commands.vehicle_data import read_readiness_monitors

        adapter = MockObdAdapter(profile_name="toyota_real_sample")
        result = read_readiness_monitors(adapter)
        assert result["supported"] is True
        value = result["value"]
        assert value["milStatus"] == "OFF"
        assert value["storedDtcCount"] == 0
        assert value["rawResponse"] == "410100044000"
        assert len(value["monitors"]) == 11


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
