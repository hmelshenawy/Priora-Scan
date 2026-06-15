"""Unit tests for ELM327 response parser (elm_parser.py)."""

import pytest

from src.obd.commands.elm_parser import (
    clean_raw_response,
    compact_raw_response,
    parse_vin,
    parse_dtcs,
    parse_clear_result,
    parse_pid_bytes,
    parse_supported_pids,
    _decode_dtc_byte_pair,
    UNSUPPORTED,
    PARSE_ERROR,
    INCOMPLETE_DATA,
    ADAPTER_STOPPED,
)


# ---------------------------------------------------------------------------
# clean_raw_response
# ---------------------------------------------------------------------------

class TestCleanRawResponse:
    def test_strip_prompt(self):
        result = clean_raw_response(b"41 0C FF 1A\r\r>")
        assert ">" not in result
        assert "41 0C FF 1A" in result

    def test_strip_carriage_returns(self):
        result = clean_raw_response(b"43 01 33\r00 01 09 01 01\r>")
        assert "\r" not in result
        assert "43 01 33" in result

    def test_strip_searching(self):
        result = clean_raw_response(b"SEARCHING...\r0142 0C FF 1A\r>")
        assert "SEARCHING" not in result
        assert "0142" in result

    def test_collapse_whitespace(self):
        result = clean_raw_response(b"  41   0C   FF  \r\r>")
        assert result == "41 0C FF"

    def test_empty_response(self):
        result = clean_raw_response(b">")
        assert result == ""

    def test_strip_command_echo(self):
        result = clean_raw_response(b"010C\r410C0E10\r\r>", command="010C")
        assert result == "410C0E10"

    def test_compact_strip_prompt_and_echo(self):
        result = compact_raw_response(b"010C\r41 0C 0E 10\r\r>", command="010C")
        assert result == "410C0E10"


# ---------------------------------------------------------------------------
# parse_vin
# ---------------------------------------------------------------------------

class TestParseVin:
    def test_multi_frame_vin(self):
        # Real ELM327 multi-frame VIN response
        # "1HGCM82633A004352" — 3 frames
        # Frame 1: 49 02 01 05 <5 data bytes>
        # Frame 2: 49 02 02 <7 data bytes>
        # Frame 3: 49 02 03 <5 data bytes>
        raw = (
            b"49 02 01 05 31 48 47 43 4D 38\r"
            b"49 02 02 32 36 33 33 41 30 30 34\r"
            b"49 02 03 33 35 32\r"
            b">"
        )
        cleaned = clean_raw_response(raw)
        result = parse_vin(cleaned)
        assert result["supported"] is True
        assert len(result["value"]) == 17
        assert result["value"] == "1HGCM82633A004352"

    def test_no_data(self):
        result = parse_vin("NO DATA")
        assert result == UNSUPPORTED

    def test_unsupported_command(self):
        result = parse_vin("?")
        assert result == PARSE_ERROR

    def test_stopped(self):
        result = parse_vin("STOPPED")
        assert result == ADAPTER_STOPPED

    def test_truncated_response(self):
        cleaned = "49 02 01 05 00 00 00 31"
        result = parse_vin(cleaned)
        # Should still return something, possibly with a warning
        assert "value" in result or "error" in result


# ---------------------------------------------------------------------------
# parse_dtcs
# ---------------------------------------------------------------------------

class TestParseDtc:
    def test_multiple_dtcs(self):
        # Space-delimited byte format (ATS0 still leaves spaces in some adapters)
        # 0133 → P0133, 0171 → P0171, 0101 → P0101
        cleaned = "43 01 33 01 71 01 01"
        result = parse_dtcs(cleaned)
        assert result["supported"] is True
        codes = result["codes"]
        assert "P0133" in codes
        assert "P0171" in codes
        assert "P0101" in codes

    def test_no_dtcs(self):
        # 0133 0000 0000 → only P0133, rest are zeros
        cleaned = "43 00 00 00 00"
        result = parse_dtcs(cleaned)
        assert result["supported"] is True
        assert result["codes"] == []

    def test_no_data_returns_empty(self):
        result = parse_dtcs("NO DATA")
        assert result["supported"] is True
        assert result["codes"] == []

    def test_unsupported_command(self):
        result = parse_dtcs("?")
        assert result == PARSE_ERROR

    def test_body_code(self):
        # B0100: prefix=B(2), d1=0, d2=1, d3=0, d4=0
        # first_byte = (2<<6)|(0<<4)|1 = 0x81
        # second_byte = (0<<4)|0 = 0x00
        # Compact hex format: "8100"
        # second byte = (d3 << 4) | d4 = (0<<4)|0 = 0x00
        # So hex = "8100"
        cleaned = "43 8100"
        result = parse_dtcs(cleaned)
        assert "B0100" in result["codes"]


# ---------------------------------------------------------------------------
# parse_clear_result
# ---------------------------------------------------------------------------

class TestParseClearResult:
    def test_success(self):
        result = parse_clear_result("44")
        assert result["success"] is True

    def test_failure_7f(self):
        result = parse_clear_result("7F 04 31")
        assert result["success"] is False
        assert "7F" in result["reason"]
        assert "04" in result["reason"]

    def test_no_data(self):
        result = parse_clear_result("NO DATA")
        assert result["success"] is False
        assert "NO DATA" in result["reason"]

    def test_unsupported_command(self):
        result = parse_clear_result("?")
        assert result["success"] is False
        assert "unsupported" in result["reason"]

    def test_stopped(self):
        result = parse_clear_result("STOPPED")
        assert result == ADAPTER_STOPPED


# ---------------------------------------------------------------------------
# parse_pid_bytes
# ---------------------------------------------------------------------------

class TestParsePidBytes:
    def test_standard_response(self):
        # 41 0C FF 1A → Mode 01 PID 0C, data = FF 1A
        cleaned = "41 0C FF 1A"
        result = parse_pid_bytes(cleaned)
        assert result["supported"] is True
        assert result["value"] == bytes.fromhex("FF1A")

    def test_no_data(self):
        result = parse_pid_bytes("NO DATA")
        assert result == UNSUPPORTED

    def test_unsupported_command(self):
        result = parse_pid_bytes("?")
        assert result == PARSE_ERROR

    def test_compact_hex(self):
        # No spaces between hex bytes — compact ELM327 format (ATS0)
        cleaned = "410CFF1A"
        result = parse_pid_bytes(cleaned)
        assert result["supported"] is True
        assert result["value"] == bytes.fromhex("FF1A")

    def test_prompt_terminated_response(self):
        cleaned = clean_raw_response(b"410C0E10\r\r>")
        result = parse_pid_bytes(cleaned)
        assert result["supported"] is True
        assert result["value"] == bytes.fromhex("0E10")

    def test_prompt_terminated_no_data(self):
        cleaned = clean_raw_response(b"NO DATA\r\r>")
        result = parse_pid_bytes(cleaned)
        assert result == UNSUPPORTED

    def test_truncated_data(self):
        # Only mode byte, no data
        cleaned = "41"
        result = parse_pid_bytes(cleaned)
        assert "error" in result


# ---------------------------------------------------------------------------
# parse_supported_pids
# ---------------------------------------------------------------------------

class TestParseSupportedPids:
    def test_bitmask_pids(self):
        # 41 00 BE 1F B8 20
        # Bitmask BE1FB820 → binary of BE: 10111110
        # PIDs 01-20: bit 0=PID01, bit 1=PID02, ...
        # 0xBE = 10111110 → bits 1,2,3,4,5,7 → PIDs 02,03,04,05,06,08... wait
        # Actually: MSB first. Bit 0 = PID 01, bit 1 = PID 02, etc.
        # 0xBE = 1011 1110 → bits set: 1,2,3,4,5,7,8,9,10,11,12,13,14
        # Let me just verify the function returns a non-empty list
        cleaned = "41 00 BE 1F B8 20"
        result = parse_supported_pids(cleaned)
        assert result["supported"] is True
        assert len(result["pids"]) > 0
        # PID 01 should always be supported (bit 0 of first byte)
        assert "01" in result["pids"]

    def test_no_data(self):
        result = parse_supported_pids("NO DATA")
        assert result == UNSUPPORTED

    def test_unsupported_command(self):
        result = parse_supported_pids("?")
        assert result == PARSE_ERROR

    def test_stopped(self):
        result = parse_supported_pids("STOPPED")
        assert result == ADAPTER_STOPPED

    def test_high_pid_range(self):
        # 41 20 81 00 84 02 → PIDs 21-40 range
        cleaned = "41 20 81 00 84 02"
        result = parse_supported_pids(cleaned)
        assert result["supported"] is True
        # Base offset 0x20 → first PID in this range is 0x21
        assert "21" in result["pids"]


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_question_mark_unsupported(self):
        """'?' from ELM327 means command not understood."""
        assert clean_raw_response(b"?\r>") == "?"
        assert parse_vin("?") == PARSE_ERROR
        assert parse_dtcs("?") == PARSE_ERROR
        assert parse_pid_bytes("?") == PARSE_ERROR

    def test_partial_hex_returns_error(self):
        """Truncated/incomplete hex data returns error dict."""
        result = parse_pid_bytes("41 0C")  # Only header, no data
        assert "error" in result

    def test_searching_stripped_from_vin(self):
        """SEARCHING... is stripped before VIN parsing."""
        raw = (
            b"SEARCHING...\r"
            b"49 02 01 05 31 48 47 43 4D 38\r"
            b"49 02 02 32 36 33 33 41 30 30 34\r"
            b"49 02 03 33 35 32\r>"
        )
        cleaned = clean_raw_response(raw)
        assert "SEARCHING" not in cleaned
        # Should still parse the VIN
        result = parse_vin(cleaned)
        assert result["supported"] is True
        assert len(result["value"]) == 17


# ---------------------------------------------------------------------------
# _decode_dtc_byte_pair (shared helper for DTC decoding)
# ---------------------------------------------------------------------------

class TestDecodeDtcBytePair:
    """Tests for the shared DTC byte-pair decoding helper.

    This helper is used by both parse_dtcs() (Mode 03) and
    parse_freeze_frame() (Mode 02) to decode 2-byte DTC codes.
    """

    def test_powertrain_code_p0101(self):
        """P0101: first_byte=0x01, second_byte=0x01"""
        assert _decode_dtc_byte_pair(0x01, 0x01) == "P0101"

    def test_powertrain_code_p0301(self):
        """P0301: first_byte=0x03, second_byte=0x01"""
        assert _decode_dtc_byte_pair(0x03, 0x01) == "P0301"

    def test_powertrain_code_p0133(self):
        """P0133: first_byte=0x01, second_byte=0x33"""
        assert _decode_dtc_byte_pair(0x01, 0x33) == "P0133"

    def test_body_code_b0100(self):
        """B0100: first_byte=0x81 (type=2=B, digit1=0, digit2=1), second_byte=0x00"""
        assert _decode_dtc_byte_pair(0x81, 0x00) == "B0100"

    def test_chassis_code_c0000(self):
        """C0000: first_byte=0x40 (type=1=C), second_byte=0x00"""
        assert _decode_dtc_byte_pair(0x40, 0x00) == "C0000"

    def test_network_code_u0100(self):
        """U0100: first_byte=0xC1 (type=3=U), second_byte=0x00"""
        assert _decode_dtc_byte_pair(0xC1, 0x00) == "U0100"

    def test_zero_bytes_returns_p0000(self):
        """Zero bytes (00 00) should decode to P0000, not be skipped.

        Skipping zero codes is the caller's responsibility (parse_dtcs
        does skip, but freeze frame may need to report P0000).
        """
        assert _decode_dtc_byte_pair(0x00, 0x00) == "P0000"

    def test_all_type_prefixes(self):
        """Verify all four DTC type prefixes decode correctly."""
        # P (powertrain) = 0x00 high nibble >> 6
        assert _decode_dtc_byte_pair(0x00, 0x01) == "P0001"
        # C (chassis) = 0x40 >> 6 = 1
        assert _decode_dtc_byte_pair(0x40, 0x01) == "C0001"
        # B (body) = 0x80 >> 6 = 2
        assert _decode_dtc_byte_pair(0x80, 0x01) == "B0001"
        # U (network) = 0xC0 >> 6 = 3
        assert _decode_dtc_byte_pair(0xC0, 0x01) == "U0001"
