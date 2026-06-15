"""Unit tests for the reusable UDS response parser module.

Validates parse_raw_header_payload(), classify_response(),
extract_negative_response(), and NEGATIVE_RESPONSE_CODES.
"""

import pytest

from src.obd.commands.uds_response_parser import (
    NEGATIVE_RESPONSE_CODES,
    classify_response,
    extract_negative_response,
    parse_raw_header_payload,
)


# ---------------------------------------------------------------------------
# NEGATIVE_RESPONSE_CODES
# ---------------------------------------------------------------------------


class TestNegativeResponseCodes:
    """Tests for the NEGATIVE_RESPONSE_CODES mapping."""

    def test_known_codes_mapped(self):
        """All 7 standard UDS NRCs are mapped correctly."""
        expected = {
            "11": "SERVICE_NOT_SUPPORTED",
            "12": "SUB_FUNCTION_NOT_SUPPORTED",
            "13": "INCORRECT_MESSAGE_LENGTH_OR_INVALID_FORMAT",
            "22": "CONDITIONS_NOT_CORRECT",
            "31": "REQUEST_OUT_OF_RANGE",
            "33": "SECURITY_ACCESS_DENIED",
            "78": "RESPONSE_PENDING",
        }
        for code, meaning in expected.items():
            assert NEGATIVE_RESPONSE_CODES[code] == meaning, (
                f"Expected NRC {code} → {meaning}, got {NEGATIVE_RESPONSE_CODES.get(code)}"
            )

    def test_unknown_code_falls_back(self):
        """Unknown NRC codes are not in the mapping; classify_response
        should use UNKNOWN_NEGATIVE_RESPONSE for unknown codes."""
        assert "99" not in NEGATIVE_RESPONSE_CODES
        # classify_response must handle unknown NRCs gracefully
        result = classify_response("7E8037F2299", "7E0")
        assert result["negativeResponseCode"] == "99"
        assert result["negativeResponseMeaning"] == "UNKNOWN_NEGATIVE_RESPONSE"

    def test_mapping_has_seven_entries(self):
        """The mapping contains exactly the 7 standard codes."""
        assert len(NEGATIVE_RESPONSE_CODES) == 7


# ---------------------------------------------------------------------------
# parse_raw_header_payload()
# ---------------------------------------------------------------------------


class TestParseRawHeaderPayload:
    """Tests for parse_raw_header_payload()."""

    def test_valid_response_with_header_and_payload(self):
        """Standard 11-bit CAN response with header and payload."""
        header, payload = parse_raw_header_payload("7E8037F2211")
        assert header == "7E8"
        assert payload == "037F2211"

    def test_positive_response_with_header(self):
        """Positive UDS response with header."""
        header, payload = parse_raw_header_payload("7E8101462F1905A58")
        assert header == "7E8"
        assert payload == "101462F1905A58"

    def test_no_data_returns_none(self):
        """NO DATA returns (None, None)."""
        header, payload = parse_raw_header_payload("NO DATA")
        assert header is None
        assert payload is None

    def test_empty_string_returns_none(self):
        """Empty string returns (None, None)."""
        header, payload = parse_raw_header_payload("")
        assert header is None
        assert payload is None

    def test_whitespace_only_returns_none(self):
        """Whitespace-only string returns (None, None)."""
        header, payload = parse_raw_header_payload("   ")
        assert header is None
        assert payload is None

    def test_garbage_returns_none(self):
        """Non-hex garbage returns (None, None)."""
        header, payload = parse_raw_header_payload("GARBAGE")
        assert header is None
        assert payload is None

    def test_too_short_returns_none(self):
        """Response shorter than 5 hex chars returns (None, None)."""
        header, payload = parse_raw_header_payload("7E8")
        assert header is None
        assert payload is None

    def test_strips_spaces(self):
        """Spaces in hex response are handled."""
        header, payload = parse_raw_header_payload("7E8 03 7F 22 11")
        assert header == "7E8"
        assert payload == "037F2211"

    def test_case_insensitive(self):
        """Lowercase hex is accepted."""
        header, payload = parse_raw_header_payload("7e8037f2211")
        assert header == "7E8"
        assert payload == "037F2211"

    def test_ascii_hex_encoded_response_is_normalized(self):
        """ASCII-hex encoded readable response is decoded before parsing."""
        header, payload = parse_raw_header_payload("37453831343632463139303537")
        assert header == "7E8"
        assert payload == "1462F19057"


# ---------------------------------------------------------------------------
# classify_response()
# ---------------------------------------------------------------------------


class TestClassifyResponse:
    """Tests for classify_response()."""

    # --- POSITIVE responses ---

    def test_positive_response(self):
        """A positive UDS response (6X service byte) is classified as DISCOVERED/POSITIVE."""
        result = classify_response("7E8101462F1905A58", "7E0")
        assert result["status"] == "DISCOVERED"
        assert result["responseType"] == "POSITIVE"
        assert result["responseId"] == "7E8"
        assert result["rawHeader"] == "7E8"
        assert result["rawPayload"] == "101462F1905A58"
        assert result["negativeResponseCode"] is None
        assert result["negativeResponseMeaning"] is None

    def test_positive_response_62_prefix(self):
        """Positive response with 62 (ReadDataByIdentifier positive)."""
        result = classify_response("7E80562F1905731", "7E0")
        assert result["status"] == "DISCOVERED"
        assert result["responseType"] == "POSITIVE"
        assert result["responseId"] == "7E8"

    def test_ascii_hex_encoded_positive_response_is_normalized(self):
        """Double-encoded raw response stores readable CAN ID and raw response."""
        result = classify_response(
            "3745383134363246313930353733313442343134363334",
            "7E0",
        )
        assert result["status"] == "DISCOVERED"
        assert result["responseType"] == "POSITIVE"
        assert result["responseId"] == "7E8"
        assert result["rawHeader"] == "7E8"
        assert result["rawResponse"].startswith("7E8")
        assert not result["rawResponse"].startswith("374")

    # --- NEGATIVE responses ---

    def test_negative_response_service_not_supported(self):
        """Negative response 7F2211 → SERVICE_NOT_SUPPORTED."""
        result = classify_response("7E8037F2211", "7E0")
        assert result["status"] == "DISCOVERED"
        assert result["responseType"] == "NEGATIVE"
        assert result["responseId"] == "7E8"
        assert result["rawHeader"] == "7E8"
        assert result["rawPayload"] == "037F2211"
        assert result["negativeResponseCode"] == "11"
        assert result["negativeResponseMeaning"] == "SERVICE_NOT_SUPPORTED"

    def test_negative_response_conditions_not_correct(self):
        """Negative response 7F2222 → CONDITIONS_NOT_CORRECT."""
        result = classify_response("7E8037F2222", "7E0")
        assert result["status"] == "DISCOVERED"
        assert result["responseType"] == "NEGATIVE"
        assert result["negativeResponseCode"] == "22"
        assert result["negativeResponseMeaning"] == "CONDITIONS_NOT_CORRECT"

    def test_negative_response_unknown_nrc(self):
        """Unknown NRC code maps to UNKNOWN_NEGATIVE_RESPONSE."""
        result = classify_response("7E8037F2299", "7E0")
        assert result["status"] == "DISCOVERED"
        assert result["responseType"] == "NEGATIVE"
        assert result["negativeResponseCode"] == "99"
        assert result["negativeResponseMeaning"] == "UNKNOWN_NEGATIVE_RESPONSE"

    def test_negative_response_without_header(self):
        """Short negative response without CAN header prefix."""
        result = classify_response("7F2211", "7DF")
        assert result["status"] == "DISCOVERED"
        assert result["responseType"] == "NEGATIVE"
        assert result["negativeResponseCode"] == "11"
        assert result["negativeResponseMeaning"] == "SERVICE_NOT_SUPPORTED"

    # --- NO DATA responses ---

    def test_no_data_response(self):
        """NO DATA is classified as NOT_FOUND/NO_RESPONSE."""
        result = classify_response("NO DATA", "7E1")
        assert result["status"] == "NOT_FOUND"
        assert result["responseType"] == "NO_RESPONSE"
        assert result["responseId"] is None
        assert result["rawHeader"] is None
        assert result["rawPayload"] is None
        assert result["negativeResponseCode"] is None
        assert result["negativeResponseMeaning"] is None

    def test_empty_string_is_no_response(self):
        """Empty string is treated as NO DATA."""
        result = classify_response("", "7E1")
        assert result["status"] == "NOT_FOUND"
        assert result["responseType"] == "NO_RESPONSE"

    def test_whitespace_string_is_no_response(self):
        """Whitespace-only string is treated as NO DATA."""
        result = classify_response("   ", "7E1")
        assert result["status"] == "NOT_FOUND"
        assert result["responseType"] == "NO_RESPONSE"

    # --- MALFORMED responses ---

    def test_malformed_garbage(self):
        """Non-hex garbage is classified as UNKNOWN/MALFORMED."""
        result = classify_response("GARBAGE", "7E2")
        assert result["status"] == "UNKNOWN"
        assert result["responseType"] == "MALFORMED"
        assert result["responseId"] is None
        assert result["rawHeader"] is None
        assert result["rawPayload"] is None

    def test_malformed_short_hex(self):
        """Valid hex that is too short to parse is MALFORMED."""
        result = classify_response("7E8", "7E0")
        assert result["status"] == "UNKNOWN"
        assert result["responseType"] == "MALFORMED"

    # --- Multiple responders from single probe ---

    def test_classify_single_line_from_multiline(self):
        """classify_response handles single lines correctly
        (multiline splitting is done by parse_multiline_response)."""
        # Each line is classified independently
        line1_result = classify_response("7E8037F2211", "7DF")
        assert line1_result["status"] == "DISCOVERED"
        assert line1_result["responseType"] == "NEGATIVE"
        assert line1_result["responseId"] == "7E8"

        line2_result = classify_response("7EA037F2211", "7DF")
        assert line2_result["status"] == "DISCOVERED"
        assert line2_result["responseType"] == "NEGATIVE"
        assert line2_result["responseId"] == "7EA"


# ---------------------------------------------------------------------------
# extract_negative_response()
# ---------------------------------------------------------------------------


class TestExtractNegativeResponse:
    """Tests for extract_negative_response()."""

    def test_extract_from_full_response(self):
        """Extract NRC from a full negative response with header."""
        nrc_service, nrc_code = extract_negative_response("7E8037F2211")
        assert nrc_service == "22"
        assert nrc_code == "11"

    def test_extract_from_short_response(self):
        """Extract NRC from a short negative response without header."""
        nrc_service, nrc_code = extract_negative_response("7F2211")
        assert nrc_service == "22"
        assert nrc_code == "11"

    def test_no_data_returns_none(self):
        """NO DATA returns (None, None)."""
        nrc_service, nrc_code = extract_negative_response("NO DATA")
        assert nrc_service is None
        assert nrc_code is None

    def test_empty_returns_none(self):
        """Empty string returns (None, None)."""
        nrc_service, nrc_code = extract_negative_response("")
        assert nrc_service is None
        assert nrc_code is None

    def test_no_7f_marker_returns_none(self):
        """Response without 7F marker returns (None, None)."""
        nrc_service, nrc_code = extract_negative_response("7E862F190")
        assert nrc_service is None
        assert nrc_code is None

    def test_truncated_negative_response(self):
        """Truncated negative response (too short after 7F) returns (None, None)."""
        nrc_service, nrc_code = extract_negative_response("7F22")
        assert nrc_service is None
        assert nrc_code is None

    def test_response_pending_78(self):
        """Extract NRC 78 (RESPONSE_PENDING)."""
        nrc_service, nrc_code = extract_negative_response("7E8047F2278")
        assert nrc_service == "22"
        assert nrc_code == "78"

    def test_spaces_stripped(self):
        """Spaces in response are handled."""
        nrc_service, nrc_code = extract_negative_response("7E8 03 7F 22 11")
        assert nrc_service == "22"
        assert nrc_code == "11"


# ---------------------------------------------------------------------------
# parse_multiline_response()
# ---------------------------------------------------------------------------


class TestParseMultilineResponse:
    """Tests for parse_multiline_response()."""

    def test_single_line_response(self):
        """A single-line response produces one result."""
        from src.obd.commands.uds_response_parser import parse_multiline_response

        results = parse_multiline_response("7E8037F2211", "7DF")
        assert len(results) == 1
        assert results[0]["responseId"] == "7E8"
        assert results[0]["status"] == "DISCOVERED"

    def test_multiline_multiple_ecus(self):
        """Multiple response lines produce one result per ECU."""
        from src.obd.commands.uds_response_parser import parse_multiline_response

        raw = "7E8037F2211\n7EA037F2211\n7EC037F2211"
        results = parse_multiline_response(raw, "7DF")
        assert len(results) == 3
        assert results[0]["responseId"] == "7E8"
        assert results[1]["responseId"] == "7EA"
        assert results[2]["responseId"] == "7EC"

    def test_multiline_with_carriage_returns(self):
        """Carriage returns in multiline response are handled."""
        from src.obd.commands.uds_response_parser import parse_multiline_response

        raw = "7E8037F2211\r\n7EA037F2211\r\n7EC037F2211"
        results = parse_multiline_response(raw, "7DF")
        assert len(results) == 3

    def test_all_no_data(self):
        """Entire response is NO DATA produces one NOT_FOUND result."""
        from src.obd.commands.uds_response_parser import parse_multiline_response

        results = parse_multiline_response("NO DATA", "7DF")
        assert len(results) == 1
        assert results[0]["status"] == "NOT_FOUND"

    def test_empty_string_returns_empty_list(self):
        """Empty string returns empty list."""
        from src.obd.commands.uds_response_parser import parse_multiline_response

        results = parse_multiline_response("", "7DF")
        assert results == []
