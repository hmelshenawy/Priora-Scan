import pytest
from unittest.mock import MagicMock

from src.obd.commands.vin import read_vin
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
        assert result == "1HGCM82633A123456"
        assert len(result) == 17

    def test_read_vin_rejects_wrong_prefix(self):
        adapter = MockAdapter({"0902": b"4802BAD"})
        with pytest.raises(RuntimeError, match="Unexpected VIN response"):
            read_vin(adapter)

    def test_read_vin_rejects_short_vin(self):
        short_hex = "AB".encode("ascii").hex().upper()
        adapter = MockAdapter({"0902": f"4902{short_hex}".encode("ascii")})
        with pytest.raises(RuntimeError, match="Invalid VIN length"):
            read_vin(adapter)


class TestDtcParser:
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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
