"""Unit tests for freeze frame data parsing and reading.

Tests for parse_freeze_frame() and read_freeze_frame() following
the parser-first implementation order (T002 → T003 → T004).

SAE J1979 Mode 02 PID 01 freeze frame response format:
  42 01 [DTC_byte_1] [DTC_byte_2] [PID_num] [PID_value_bytes...] ...

MVP PID encoding:
  PID 04 (Engine Load):    1 byte, value * 100 / 255
  PID 05 (Coolant Temp):   1 byte, value - 40
  PID 0C (RPM):            2 bytes, (A * 256 + B) / 4
  PID 0D (Vehicle Speed):  1 byte, value (km/h)

DTC encoding (shared with parse_dtcs via _decode_dtc_byte_pair):
  first_byte high 2 bits: type (0=P, 1=C, 2=B, 3=U)
  first_byte bits 4-5: digit1
  first_byte low 4 bits: digit2
  second_byte high 4 bits: digit3
  second_byte low 4 bits: digit4
"""

import pytest

from src.obd.commands.vehicle_data import parse_freeze_frame, read_freeze_frame
from src.obd.mock_adapter import MockObdAdapter


# ---------------------------------------------------------------------------
# SAE J1979 Freeze Frame Test Constants (T002)
# ---------------------------------------------------------------------------

# Valid response: DTC P0103, RPM=2450, Speed=72, Load=58%, Coolant=91°C
# Encoding:
#   DTC P0103: first_byte=0x01 (P, digit1=0, digit2=1), second_byte=0x03
#   PID 04 (Load 58%): 0x93 = 58 * 255 / 100 ≈ 147.9 → 148 → 148*100/255 ≈ 58.04%
#     Actually: 58% → value = 58 * 255 / 100 = 147.9 → round to 148 = 0x94
#     Let me recalculate: 58% → value = round(58 * 255 / 100) = 148 = 0x94
#   PID 05 (Coolant 91°C): 91 + 40 = 131 = 0x83
#   PID 0C (RPM 2450): 2450 * 4 = 9800 = 0x2648 → A=0x26, B=0x48
#   PID 0D (Speed 72 km/h): 72 = 0x48
FREEZE_FRAME_ALL_PIDS = "42010103049405830C26480D48"

# Valid response with partial PIDs: DTC P0103, RPM only (no speed, load, coolant)
FREEZE_FRAME_PARTIAL_RPM_ONLY = "420101030C2648"

# DTC 0000 with no PID pairs (unavailable state)
# This represents: supported but no freeze frame data stored
FREEZE_FRAME_DTC_0000_NO_PIDS = "42010000"

# DTC 0000 with PID pairs (available with zero-DTC indicator)
FREEZE_FRAME_DTC_0000_WITH_PIDS = "4201000004940D48"

# DTC P0301 with only RPM and speed
# P0301: first_byte=0x03, second_byte=0x01
# RPM 1600: 1600*4=6400=0x1900 → A=0x19, B=0x00
# Speed 55: 55=0x37
FREEZE_FRAME_P0301_RPM_SPEED = "420103010C19000D37"

# Prefix mismatch: Mode 01 header instead of Mode 02
PREFIX_MISMATCH_MODE_01 = "4101010304940505830C26480D48"

# Unknown PIDs mixed with known MVP PIDs
# DTC P0103, PID 04 (load), PID 0F (intake air temp - unknown, 1 byte), PID 0C (RPM)
FREEZE_FRAME_MIXED_PIDS = "4201010304940F3B0C2648"

# Too-short response: header only, no DTC or PID data
FREEZE_FRAME_TOO_SHORT_HEADER_ONLY = "4201"

# Response with only header and DTC bytes, no PID data
FREEZE_FRAME_DTC_ONLY = "42010103"

# NO DATA response
FREEZE_FRAME_NO_DATA = "NO DATA"

# Empty response
FREEZE_FRAME_EMPTY = ""

# Invalid hex characters
FREEZE_FRAME_INVALID_HEX = "4201ZZ030494"


class TestParseFreezeFrameAllPids:
    """Test parse_freeze_frame with a valid response containing all 4 MVP PIDs."""

    def test_decodes_dtc(self):
        result = parse_freeze_frame(FREEZE_FRAME_ALL_PIDS)
        assert result is not None
        assert result["dtc"] == "P0103"

    def test_decodes_rpm(self):
        result = parse_freeze_frame(FREEZE_FRAME_ALL_PIDS)
        assert result is not None
        # RPM: 0x2648 → (0x26 * 256 + 0x48) / 4 = (38 * 256 + 72) / 4 = 9800 / 4 = 2450.0
        assert result["rpm"] == 2450.0

    def test_decodes_speed(self):
        result = parse_freeze_frame(FREEZE_FRAME_ALL_PIDS)
        assert result is not None
        # Speed: 0x48 = 72 km/h
        assert result["speed"] == 72

    def test_decodes_engine_load(self):
        result = parse_freeze_frame(FREEZE_FRAME_ALL_PIDS)
        assert result is not None
        # Load: 0x94 → 148 * 100 / 255 ≈ 58.04%
        assert abs(result["engineLoad"] - 58.04) < 0.1

    def test_decodes_coolant_temperature(self):
        result = parse_freeze_frame(FREEZE_FRAME_ALL_PIDS)
        assert result is not None
        # Coolant: 0x83 → 131 - 40 = 91°C
        assert result["coolantTemperature"] == 91

    def test_additional_pids_empty_when_no_unknowns(self):
        result = parse_freeze_frame(FREEZE_FRAME_ALL_PIDS)
        assert result is not None
        assert result["additionalPids"] == {}

    def test_raw_response_preserved(self):
        result = parse_freeze_frame(FREEZE_FRAME_ALL_PIDS)
        assert result is not None
        assert result["rawResponse"] == FREEZE_FRAME_ALL_PIDS


class TestParseFreezeFramePartialPids:
    """Test parse_freeze_frame with partial PID coverage."""

    def test_rpm_only_decodes_rpm(self):
        result = parse_freeze_frame(FREEZE_FRAME_PARTIAL_RPM_ONLY)
        assert result is not None
        assert result["dtc"] == "P0103"
        assert result["rpm"] == 2450.0

    def test_rpm_only_missing_pids_are_null(self):
        result = parse_freeze_frame(FREEZE_FRAME_PARTIAL_RPM_ONLY)
        assert result is not None
        assert result["speed"] is None
        assert result["coolantTemperature"] is None
        assert result["engineLoad"] is None


class TestParseFreezeFrameDtcZeroNoPids:
    """Test parse_freeze_frame with DTC 0000 and no PID pairs."""

    def test_decodes_dtc_p0000(self):
        result = parse_freeze_frame(FREEZE_FRAME_DTC_0000_NO_PIDS)
        assert result is not None
        assert result["dtc"] == "P0000"

    def test_all_mvp_pids_are_null(self):
        result = parse_freeze_frame(FREEZE_FRAME_DTC_0000_NO_PIDS)
        assert result is not None
        assert result["rpm"] is None
        assert result["speed"] is None
        assert result["coolantTemperature"] is None
        assert result["engineLoad"] is None


class TestParseFreezeFrameDtcZeroWithPids:
    """Test parse_freeze_frame with DTC 0000 but PID data present."""

    def test_decodes_dtc_p0000_with_pids(self):
        result = parse_freeze_frame(FREEZE_FRAME_DTC_0000_WITH_PIDS)
        assert result is not None
        assert result["dtc"] == "P0000"

    def test_decodes_available_pids(self):
        result = parse_freeze_frame(FREEZE_FRAME_DTC_0000_WITH_PIDS)
        assert result is not None
        assert result["engineLoad"] is not None
        assert result["speed"] is not None


class TestParseFreezeFrameEdgeCases:
    """Test parse_freeze_frame with error and edge cases."""

    def test_no_data_returns_none(self):
        assert parse_freeze_frame(FREEZE_FRAME_NO_DATA) is None

    def test_empty_string_returns_none(self):
        assert parse_freeze_frame(FREEZE_FRAME_EMPTY) is None

    def test_invalid_hex_returns_none(self):
        assert parse_freeze_frame(FREEZE_FRAME_INVALID_HEX) is None

    def test_prefix_mismatch_returns_none(self):
        # Mode 01 header (41) instead of Mode 02 header (42)
        assert parse_freeze_frame(PREFIX_MISMATCH_MODE_01) is None

    def test_too_short_header_only_returns_none(self):
        # Only header "4201" with no data bytes
        assert parse_freeze_frame(FREEZE_FRAME_TOO_SHORT_HEADER_ONLY) is None

    def test_dtc_only_decodes_dtc(self):
        """Response with only header and DTC bytes — no PID data."""
        result = parse_freeze_frame(FREEZE_FRAME_DTC_ONLY)
        assert result is not None
        assert result["dtc"] == "P0103"
        assert result["rpm"] is None
        assert result["speed"] is None
        assert result["coolantTemperature"] is None
        assert result["engineLoad"] is None

    def test_unknown_pids_preserved_in_additional(self):
        """Unknown PIDs are preserved as raw hex in additionalPids."""
        result = parse_freeze_frame(FREEZE_FRAME_MIXED_PIDS)
        assert result is not None
        assert result["dtc"] == "P0103"
        # MVP PIDs decoded
        assert result["engineLoad"] is not None
        assert result["rpm"] is not None
        # Unknown PID 0F preserved
        assert "0F" in result["additionalPids"]

    def test_p0301_rpm_speed(self):
        """DTC P0301 with RPM and speed PIDs."""
        result = parse_freeze_frame(FREEZE_FRAME_P0301_RPM_SPEED)
        assert result is not None
        assert result["dtc"] == "P0301"
        assert result["rpm"] == 1600.0
        assert result["speed"] == 55


# ---------------------------------------------------------------------------
# read_freeze_frame() tests (T006)
# ---------------------------------------------------------------------------


class TestReadFreezeFrameWithMockAdapter:
    """Test read_freeze_frame() with MockObdAdapter profiles."""

    def test_default_profile_returns_supported_available(self):
        """Default profile has 0201 PID response with valid freeze frame data."""
        adapter = MockObdAdapter(profile_name="default")
        result = read_freeze_frame(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"]["dtc"] == "P0103"

    def test_with_faults_profile_returns_supported_available(self):
        """With-faults profile has 0201 PID response with valid freeze frame data."""
        adapter = MockObdAdapter(profile_name="with_faults")
        result = read_freeze_frame(adapter)
        assert result["supported"] is True
        assert result["available"] is True
        assert result["value"]["dtc"] == "P0301"

    def test_unsupported_vin_profile_returns_unsupported(self):
        """Unsupported VIN profile has no 0201 entry."""
        adapter = MockObdAdapter(profile_name="unsupported_vin")
        result = read_freeze_frame(adapter)
        assert result["supported"] is False
        assert result["available"] is False


class TestReadFreezeFrameUnsupportedCommand:
    """Test read_freeze_frame() when 0201 is in UNSUPPORTED_COMMANDS."""

    def test_unsupported_command_returns_unsupported(self):
        """When 0201 is in UNSUPPORTED_COMMANDS, result is unsupported."""
        adapter = MockObdAdapter(profile_name="default")
        original_unsupported = adapter._profile.UNSUPPORTED_COMMANDS.copy()
        try:
            adapter._profile.UNSUPPORTED_COMMANDS = (
                adapter._profile.UNSUPPORTED_COMMANDS | {"0201"}
            )
            result = read_freeze_frame(adapter)
            assert result["supported"] is False
            assert result["available"] is False
            assert result["value"] == {}
        finally:
            adapter._profile.UNSUPPORTED_COMMANDS = original_unsupported


class TestReadFreezeFrameDesiredStates:
    """Test read_freeze_frame() three-state model with patched adapter."""

    def test_supported_available_with_valid_data(self):
        """Valid freeze frame data returns supported=True, available=True."""
        from unittest.mock import patch

        hex_response = FREEZE_FRAME_ALL_PIDS
        with patch.object(
            MockObdAdapter,
            "send",
            return_value=hex_response.encode("ascii"),
        ):
            adapter = MockObdAdapter(profile_name="default")
            result = read_freeze_frame(adapter)
            assert result["supported"] is True
            assert result["available"] is True
            assert result["value"]["dtc"] == "P0103"
            assert result["value"]["rpm"] == 2450.0
            assert result["value"]["speed"] == 72

    def test_supported_unavailable_with_dtc_p0000_no_pids(self):
        """DTC P0000 with no PID data returns supported=True, available=False."""
        from unittest.mock import patch

        hex_response = FREEZE_FRAME_DTC_0000_NO_PIDS
        with patch.object(
            MockObdAdapter,
            "send",
            return_value=hex_response.encode("ascii"),
        ):
            adapter = MockObdAdapter(profile_name="default")
            result = read_freeze_frame(adapter)
            assert result["supported"] is True
            assert result["available"] is False
            assert result["value"] == {}

    def test_supported_unavailable_adapter_returns_no_data(self):
        """Adapter returning NO DATA results in unsupported/unavailable."""
        from unittest.mock import patch

        with patch.object(
            MockObdAdapter,
            "send",
            return_value=b"NO DATA\r\r>",
        ):
            adapter = MockObdAdapter(profile_name="default")
            result = read_freeze_frame(adapter)
            assert result["supported"] is False
            assert result["available"] is False
            assert result["value"] == {}

    def test_supported_available_with_partial_pids(self):
        """Partial PID data returns supported=True, available=True."""
        from unittest.mock import patch

        hex_response = FREEZE_FRAME_PARTIAL_RPM_ONLY
        with patch.object(
            MockObdAdapter,
            "send",
            return_value=hex_response.encode("ascii"),
        ):
            adapter = MockObdAdapter(profile_name="default")
            result = read_freeze_frame(adapter)
            assert result["supported"] is True
            assert result["available"] is True
            assert result["value"]["dtc"] == "P0103"
            assert result["value"]["rpm"] == 2450.0
            assert result["value"]["speed"] is None

    def test_no_exception_on_empty_response(self):
        """Empty adapter response never raises an exception."""
        from unittest.mock import patch

        with patch.object(
            MockObdAdapter,
            "send",
            return_value=b"",
        ):
            adapter = MockObdAdapter(profile_name="default")
            result = read_freeze_frame(adapter)
            assert isinstance(result, dict)
            assert result["supported"] is False
            assert result["available"] is False

    def test_no_exception_on_invalid_hex(self):
        """Invalid hex response never raises an exception."""
        from unittest.mock import patch

        hex_response = FREEZE_FRAME_INVALID_HEX
        with patch.object(
            MockObdAdapter,
            "send",
            return_value=hex_response.encode("ascii"),
        ):
            adapter = MockObdAdapter(profile_name="default")
            result = read_freeze_frame(adapter)
            assert isinstance(result, dict)
            assert result["supported"] is False
            assert result["available"] is False


# ---------------------------------------------------------------------------
# Profile decoding tests (T009)
# ---------------------------------------------------------------------------


class TestProfileDecodingDefault:
    """Test that default profile produces correct FreezeFrameResult."""

    def test_default_profile_freeze_frame(self):
        """Default profile 0201 response decodes to valid freeze frame data."""
        from src.obd.mock_profiles.default import PID_RESPONSES

        raw = PID_RESPONSES["0201"].hex().upper()
        result = parse_freeze_frame(raw)
        assert result is not None
        assert result["dtc"] == "P0103"
        assert result["rpm"] == 2450.0
        assert result["speed"] == 72
        assert result["coolantTemperature"] == 91
        assert abs(result["engineLoad"] - 58.04) < 0.1


class TestProfileDecodingWithFaults:
    """Test that with_faults profile produces correct FreezeFrameResult."""

    def test_with_faults_profile_freeze_frame(self):
        """With-faults profile 0201 response decodes to valid freeze frame data."""
        from src.obd.mock_profiles.with_faults import PID_RESPONSES

        raw = PID_RESPONSES["0201"].hex().upper()
        result = parse_freeze_frame(raw)
        assert result is not None
        assert result["dtc"] == "P0301"
        assert result["rpm"] == 1600.0
        assert result["speed"] == 55


class TestProfileDecodingNoFaults:
    """Test that no_faults profile returns supported but unavailable."""

    def test_no_faults_profile_freeze_frame(self):
        """No-faults profile 0201 response (DTC P0000) returns unavailable state."""
        from src.obd.mock_profiles.no_faults import PID_RESPONSES

        raw = PID_RESPONSES["0201"].hex().upper()
        result = parse_freeze_frame(raw)
        assert result is not None
        assert result["dtc"] == "P0000"
        assert result["rpm"] is None
        assert result["speed"] is None

    def test_no_faults_read_freeze_frame_returns_unavailable(self):
        """No-faults profile via read_freeze_frame returns supported/unavailable."""
        adapter = MockObdAdapter(profile_name="no_faults")
        result = read_freeze_frame(adapter)
        assert result["supported"] is True
        assert result["available"] is False
        assert result["value"] == {}


class TestProfileDecodingUnsupported:
    """Test that unsupported_vin profile returns unsupported for freeze frame."""

    def test_unsupported_vin_returns_unsupported(self):
        """Unsupported VIN profile has 0201 in UNSUPPORTED_COMMANDS."""
        adapter = MockObdAdapter(profile_name="unsupported_vin")
        result = read_freeze_frame(adapter)
        assert result["supported"] is False
        assert result["available"] is False
        assert result["value"] == {}


class TestProfileDecodingToyota:
    """Test that Toyota profiles handle freeze frame correctly."""

    def test_toyota_real_sample_freeze_frame(self):
        """Toyota real sample profile 0201 decodes (placeholder DTC P0000)."""
        from src.obd.mock_profiles.toyota_real_sample import PID_RESPONSES

        raw = PID_RESPONSES["0201"].hex().upper()
        result = parse_freeze_frame(raw)
        assert result is not None
        # Placeholder: DTC P0000 with no PID data
        assert result["dtc"] == "P0000"

    def test_toyota_real_faults_freeze_frame(self):
        """Toyota real faults profile 0201 decodes (placeholder DTC P0301)."""
        from src.obd.mock_profiles.toyota_real_faults import PID_RESPONSES

        raw = PID_RESPONSES["0201"].hex().upper()
        result = parse_freeze_frame(raw)
        assert result is not None
        assert result["dtc"] == "P0301"
        # Toyota placeholder values should be decodable
        assert result["rpm"] is not None or result["speed"] is not None