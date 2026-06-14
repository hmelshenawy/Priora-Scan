import pytest
from unittest.mock import MagicMock

from src.obd.commands.vin import read_vin, VinResult, VIN_SUPPORTED, VIN_UNSUPPORTED
from src.obd.commands.dtc import read_fault_codes, _decode_dtc, _parse_mode_response


class MockAdapter:
    """Mock ELM327 adapter that returns pre-programmed byte responses."""

    def __init__(self, responses: dict):
        self._responses = responses

    def send(self, cmd: str) -> bytes:
        return self._responses.get(cmd, b"")


class TestVinParser:
    def test_read_vin_from_valid_response(self):
        # 49 02 = Mode 09 PID 02 response prefix
        # Followed by hex-encoded ASCII "1HGCM82633A123456"
        vin_hex = "1HGCM82633A123456".encode("ascii").hex().upper()
        raw = f"4902{vin_hex}".encode("ascii")
        adapter = MockAdapter({"0902": raw})

        result = read_vin(adapter)
        assert result.status == VIN_SUPPORTED
        assert result.vin == "1HGCM82633A123456"
        assert len(result.vin) == 17

    def test_read_vin_rejects_wrong_prefix(self):
        adapter = MockAdapter({"0902": b"4802BAD"})
        result = read_vin(adapter)
        assert result.status == VIN_UNSUPPORTED
        assert result.reason == "MALFORMED"
        assert result.vin is None

    def test_read_vin_rejects_short_vin(self):
        short_hex = "AB".encode("ascii").hex().upper()
        adapter = MockAdapter({"0902": f"4902{short_hex}".encode("ascii")})
        result = read_vin(adapter)
        assert result.status == VIN_UNSUPPORTED
        assert result.reason == "MALFORMED"
        assert result.vin is None


class TestVinResultMalformed:
    """Tests for malformed VIN detection in _read_vin_mock."""

    def test_non_ascii_characters_in_vin(self):
        """VIN with non-printable characters returns UNSUPPORTED MALFORMED."""
        from src.obd.commands.vin import _read_vin_mock

        # VIN with a null byte (0x00) encoded in hex
        # 4902 + "1HGCM8263" + "00" + "A123456" (has a null byte)
        # The decode will produce a null byte which is < 0x20
        vin_with_null = b"4902" + b"31" * 8 + b"00" + b"41" * 8
        result = _read_vin_mock(vin_with_null)
        assert result.status == "UNSUPPORTED"
        assert result.reason == "MALFORMED"
        assert result.vin is None

    def test_short_vin_returns_unsupported_malformed(self):
        """VIN response with valid prefix but fewer than 17 decoded chars."""
        from src.obd.commands.vin import _read_vin_mock

        # "AB" decoded = 1 character, too short for a VIN
        short_hex = "AB".encode("ascii").hex().upper()
        adapter_response = b"4902" + short_hex.encode("ascii")
        result = _read_vin_mock(adapter_response)
        assert result.status == "UNSUPPORTED"
        assert result.reason == "MALFORMED"
        assert result.vin is None

    def test_long_vin_returns_unsupported_malformed(self):
        """VIN response with valid prefix but more than 17 decoded chars."""
        from src.obd.commands.vin import _read_vin_mock

        # 18-char VIN (one extra character)
        long_vin = "1HGCM82633A1234567"  # 18 chars
        vin_hex = long_vin.encode("ascii").hex().upper()
        adapter_response = b"4902" + vin_hex.encode("ascii")
        result = _read_vin_mock(adapter_response)
        assert result.status == "UNSUPPORTED"
        assert result.reason == "MALFORMED"
        assert result.vin is None

    def test_null_bytes_in_decoded_vin(self):
        """VIN with null bytes (0x00) in decoded string returns MALFORMED."""
        from src.obd.commands.vin import _read_vin_mock

        # Construct a response where decoded VIN has embedded null bytes
        # This is a 17-byte response with a null byte in the middle
        # "1HGCM8263\x00A123456" — has a 0x00 byte at position 9
        vin_bytes = b"1HGCM8263\x00A123456"
        vin_hex = vin_bytes.hex().upper()
        adapter_response = b"4902" + vin_hex.encode("ascii")
        result = _read_vin_mock(adapter_response)
        assert result.status == "UNSUPPORTED"
        assert result.reason == "MALFORMED"
        assert result.vin is None
    def test_decode_dtc_powertrain(self):
        # 0x03 = P0 (high byte: 0000 0011 -> prefix P, digit 0)
        # low byte 0x01 -> 01
        assert _decode_dtc(bytes([0x03, 0x01])) == "P0301"

    def test_decode_dtc_body(self):
        # 0x43 -> prefix B, digit 0 and 3, low 0x02 -> B0302
        assert _decode_dtc(bytes([0x43, 0x02])) == "B0302"

    def test_decode_dtc_chassis(self):
        # 0x83 -> prefix C, digit 0 and 3, low 0x03 -> C0303
        assert _decode_dtc(bytes([0x83, 0x03])) == "C0303"

    def test_decode_dtc_network(self):
        # 0xC3 -> prefix U, digit 0 and 3, low 0x04 -> U0304
        assert _decode_dtc(bytes([0xC3, 0x04])) == "U0304"

    def test_parse_mode_response_empty(self):
        assert _parse_mode_response(b"4300", "43") == []

    def test_parse_mode_response_empty_with_prompt(self):
        assert _parse_mode_response(b"4300\r\r>", "43") == []

    def test_parse_mode_response_with_codes(self):
        # 43 02 03 01 43 02 -> count=2, codes P0301, B0302
        raw = b"430203014302"
        result = _parse_mode_response(raw, "43")
        assert len(result) == 2
        assert _decode_dtc(result[0]) == "P0301"
        assert _decode_dtc(result[1]) == "B0302"

    def test_read_fault_codes_aggregates_all_modes(self):
        # Mode 03 (current) returns P0301
        # Mode 07 (pending) returns P0302
        # Mode 0A (permanent) returns P0303
        responses = {
            "03": b"43010301",
            "07": b"47010302",
            "0A": b"4A010303",
        }
        adapter = MockAdapter(responses)
        faults = read_fault_codes(adapter)

        codes = [f.code for f in faults]
        assert "P0301" in codes
        assert "P0302" in codes
        assert "P0303" in codes

    def test_read_fault_codes_skips_invalid_entries(self):
        # Only count=1 but provide extra bytes (should be ignored)
        responses = {
            "03": b"43010301FFEE",
            "07": b"4700",
            "0A": b"4A00",
        }
        adapter = MockAdapter(responses)
        faults = read_fault_codes(adapter)
        assert len(faults) == 1
        assert faults[0].code == "P0301"

    def test_read_fault_codes_rejects_non_hex_responses_without_crashing(self):
        responses = {
            "03": b"43A0NO DATA",
            "07": b"47\r\r",
            "0A": b"A0\r\r",
        }
        adapter = MockAdapter(responses)

        faults = read_fault_codes(adapter)

        assert faults == []

    def test_read_fault_codes_handles_prompt_and_no_data_responses(self):
        adapter = MockAdapter(
            {
                "03": b"4300\r\r>",
                "07": b"4700\r\r>",
                "0A": b"NO DATA\r\r>",
            }
        )

        faults = read_fault_codes(adapter)

        assert faults == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
