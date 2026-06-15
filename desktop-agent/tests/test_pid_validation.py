"""Tests for extended PID validation orchestration and report generation.

Covers: full validation flow, discovery abort, partial support,
supported-but-unavailable scenarios, report format, support matrix format,
raw response visibility, and failure reason classification.
"""

import pytest

from src.obd.mock_adapter import MockObdAdapter
from src.obd.commands.pid_validation import (
    read_extended_pid_validation,
    format_validation_report,
    format_support_matrix,
)


def _hex(hex_str: str) -> bytes:
    """Convert a hex string to ASCII hex bytes, matching MockObdAdapter.send() format.

    MockObdAdapter stores raw OBD bytes (bytes.fromhex("410476") = b'\\x41\\x04\\x76')
    but converts them to ASCII hex (b"410476") before returning from send().
    Our test adapters need to do the same conversion.
    """
    if not hex_str:
        return b""
    return bytes.fromhex(hex_str).hex().upper().encode("ascii")


# ---------------------------------------------------------------------------
# Helper: custom mock that returns no Mode 01 PIDs (discovery failure)
# ---------------------------------------------------------------------------

class _NoDiscoveryAdapter:
    """Adapter that returns empty bytes for all commands."""

    protocol = "TEST"
    adapter_type = "TEST"

    def connect(self) -> bool:
        return True

    def is_connected(self) -> bool:
        return True

    def send(self, command: str) -> bytes:
        return b""


# ---------------------------------------------------------------------------
# Helper: custom mock with partial PID support (only Bank 1 fuel trims)
# ---------------------------------------------------------------------------

class _PartialSupportAdapter:
    """Adapter that only supports PIDs 04, 05, 06, 07, 0C, 0D in the bitmap.

    Bank 2 PIDs (08, 09) and MAP/MAF/Throttle (0B, 10, 11) are NOT in bitmap.
    """

    protocol = "TEST"
    adapter_type = "TEST"

    # PID bitmap: PIDs 01, 04, 05, 06, 07, 0C, 0D supported
    # Bit positions: 01=bit31, 04=bit28, 05=bit27, 06=bit26, 07=bit25, 0C=bit20, 0D=bit19
    # 0x9E180000 = bits 31,28,27,26,25,20,19
    _RESPONSES = {
        "0100": _hex("41009E180000"),
        "0120": _hex("412000000000"),  # No chain continuation
        # Extended PIDs that ARE supported
        "0106": _hex("410680"),   # STFT B1: 0%
        "0107": _hex("410780"),   # LTFT B1: 0%
        # Basic PIDs
        "0104": _hex("410476"),
        "0105": _hex("41057E"),
        "010C": _hex("410C0E10"),
        "010D": _hex("410D00"),
    }

    def connect(self) -> bool:
        return True

    def is_connected(self) -> bool:
        return True

    def send(self, command: str) -> bytes:
        cmd = command.upper().strip()
        if cmd in self._RESPONSES:
            return self._RESPONSES[cmd]
        return b""


# ---------------------------------------------------------------------------
# Helper: adapter where a supported PID returns NO DATA
# ---------------------------------------------------------------------------

class _NoDataAdapter:
    """Adapter that supports all PIDs in bitmap but returns empty for PID 08."""

    protocol = "TEST"
    adapter_type = "TEST"

    _RESPONSES = {
        # PID 00 — all 7 extended PIDs supported
        "0100": _hex("41009FB98001"),
        "0120": _hex("412000000001"),
        "0140": _hex("414040000000"),
        # Extended PIDs — PID 08 returns NO DATA (empty)
        "0106": _hex("410680"),
        "0107": _hex("410780"),
        # "0108" intentionally omitted → returns empty → _send_pid returns None
        "0109": _hex("41098D"),
        "010B": _hex("410B2A"),
        "0110": _hex("41100064"),
        "0111": _hex("411105"),
        # Basic PIDs
        "0101": _hex("410100044000"),
        "0104": _hex("410476"),
        "0105": _hex("41057E"),
        "010C": _hex("410C0E10"),
        "010D": _hex("410D00"),
        "0142": _hex("41423469"),
    }

    def connect(self) -> bool:
        return True

    def is_connected(self) -> bool:
        return True

    def send(self, command: str) -> bytes:
        cmd = command.upper().strip()
        if cmd in self._RESPONSES:
            return self._RESPONSES[cmd]
        return b""


# ---------------------------------------------------------------------------
# Helper: adapter where a supported PID returns wrong prefix
# ---------------------------------------------------------------------------

class _PrefixMismatchAdapter:
    """Adapter where PID 0B returns a response with wrong prefix."""

    protocol = "TEST"
    adapter_type = "TEST"

    _RESPONSES = {
        # PID 00 — all 7 extended PIDs supported
        "0100": _hex("41009FB98001"),
        "0120": _hex("412000000001"),
        "0140": _hex("414040000000"),
        # Extended PIDs — PID 0B returns wrong prefix
        "0106": _hex("410680"),
        "0107": _hex("410780"),
        "0108": _hex("41087F"),
        "0109": _hex("41098D"),
        "010B": _hex("410680"),  # Wrong prefix! Expected 410B, got 4106
        "0110": _hex("41100064"),
        "0111": _hex("411105"),
        # Basic PIDs
        "0101": _hex("410100044000"),
        "0104": _hex("410476"),
        "0105": _hex("41057E"),
        "010C": _hex("410C0E10"),
        "010D": _hex("410D00"),
        "0142": _hex("41423469"),
    }

    def connect(self) -> bool:
        return True

    def is_connected(self) -> bool:
        return True

    def send(self, command: str) -> bytes:
        cmd = command.upper().strip()
        if cmd in self._RESPONSES:
            return self._RESPONSES[cmd]
        return b""


# ---------------------------------------------------------------------------
# Helper: adapter where a supported PID returns insufficient bytes
# ---------------------------------------------------------------------------

class _InvalidResponseAdapter:
    """Adapter where PID 10 (MAF) returns only prefix with no data bytes."""

    protocol = "TEST"
    adapter_type = "TEST"

    _RESPONSES = {
        # PID 00 — all 7 extended PIDs supported
        "0100": _hex("41009FB98001"),
        "0120": _hex("412000000001"),
        "0140": _hex("414040000000"),
        # Extended PIDs — PID 10 returns only prefix (invalid response)
        "0106": _hex("410680"),
        "0107": _hex("410780"),
        "0108": _hex("41087F"),
        "0109": _hex("41098D"),
        "010B": _hex("410B2A"),
        "0110": _hex("4110"),  # Invalid! Prefix only, no data bytes
        "0111": _hex("411105"),
        # Basic PIDs
        "0101": _hex("410100044000"),
        "0104": _hex("410476"),
        "0105": _hex("41057E"),
        "010C": _hex("410C0E10"),
        "010D": _hex("410D00"),
        "0142": _hex("41423469"),
    }

    def connect(self) -> bool:
        return True

    def is_connected(self) -> bool:
        return True

    def send(self, command: str) -> bytes:
        cmd = command.upper().strip()
        if cmd in self._RESPONSES:
            return self._RESPONSES[cmd]
        return b""


# ---------------------------------------------------------------------------
# TestFullValidation
# ---------------------------------------------------------------------------

class TestFullValidation:
    """Full validation against the extended_pid_validation profile."""

    def setup_method(self):
        self.adapter = MockObdAdapter(profile_name="extended_pid_validation")
        self.result = read_extended_pid_validation(self.adapter)

    def test_all_seven_pids_present(self):
        """All 7 extended PIDs appear in results."""
        assert set(self.result["pids"].keys()) == {"06", "07", "08", "09", "0B", "10", "11"}

    def test_stft_bank1_decoded(self):
        """PID 06 STFT Bank 1 decodes to 0.0%."""
        pid06 = self.result["pids"]["06"]
        assert pid06["supported"] is True
        assert pid06["available"] is True
        assert pid06["value"] == 0.0

    def test_ltft_bank1_decoded(self):
        """PID 07 LTFT Bank 1 decodes to 0.0%."""
        pid07 = self.result["pids"]["07"]
        assert pid07["supported"] is True
        assert pid07["available"] is True
        assert pid07["value"] == 0.0

    def test_stft_bank2_decoded(self):
        """PID 08 STFT Bank 2 decodes to approximately -0.78%."""
        pid08 = self.result["pids"]["08"]
        assert pid08["supported"] is True
        assert pid08["available"] is True
        assert pid08["value"] == pytest.approx(-0.78, abs=0.01)

    def test_ltft_bank2_decoded(self):
        """PID 09 LTFT Bank 2 decodes to approximately 10.16%."""
        pid09 = self.result["pids"]["09"]
        assert pid09["supported"] is True
        assert pid09["available"] is True
        assert pid09["value"] == pytest.approx(10.16, abs=0.01)

    def test_map_decoded(self):
        """PID 0B MAP decodes to 42 kPa."""
        pid0b = self.result["pids"]["0B"]
        assert pid0b["supported"] is True
        assert pid0b["available"] is True
        assert pid0b["value"] == 42.0

    def test_maf_decoded(self):
        """PID 10 MAF decodes to 1.00 g/s."""
        pid10 = self.result["pids"]["10"]
        assert pid10["supported"] is True
        assert pid10["available"] is True
        assert pid10["value"] == 1.0

    def test_throttle_decoded(self):
        """PID 11 Throttle Position decodes to approximately 1.96%."""
        pid11 = self.result["pids"]["11"]
        assert pid11["supported"] is True
        assert pid11["available"] is True
        assert pid11["value"] == pytest.approx(1.96, abs=0.01)


# ---------------------------------------------------------------------------
# TestDiscoveryAbort
# ---------------------------------------------------------------------------

class TestDiscoveryAbort:
    """Validation aborts with RuntimeError when PID discovery fails."""

    def test_raises_runtime_error_on_empty_discovery(self):
        """When adapter returns no Mode 01 PIDs, RuntimeError is raised."""
        adapter = _NoDiscoveryAdapter()
        with pytest.raises(RuntimeError) as exc_info:
            read_extended_pid_validation(adapter)
        assert "Supported PID discovery failed" in str(exc_info.value)


# ---------------------------------------------------------------------------
# TestPartialSupport
# ---------------------------------------------------------------------------

class TestPartialSupport:
    """When bitmap only includes some PIDs, unsupported ones are marked correctly."""

    def setup_method(self):
        self.adapter = _PartialSupportAdapter()
        self.result = read_extended_pid_validation(self.adapter)

    def test_supported_pids_are_available(self):
        """PIDs in bitmap (06, 07) are supported and available."""
        for pid in ("06", "07"):
            pid_result = self.result["pids"][pid]
            assert pid_result["supported"] is True
            assert pid_result["available"] is True

    def test_unsupported_pids_not_queried(self):
        """PIDs not in bitmap (08, 09, 0B, 10, 11) are marked unsupported."""
        for pid in ("08", "09", "0B", "10", "11"):
            pid_result = self.result["pids"][pid]
            assert pid_result["supported"] is False
            assert pid_result["available"] is False
            assert pid_result["value"] is None


# ---------------------------------------------------------------------------
# TestSupportedButUnavailable
# ---------------------------------------------------------------------------

class TestSupportedButUnavailable:
    """PIDs in bitmap but returning NO DATA, wrong prefix, or invalid response."""

    def test_no_data_returns_unavailable_with_reason(self):
        """PID in bitmap but adapter returns empty → reader returns unsupported + reason NO_DATA."""
        adapter = _NoDataAdapter()
        result = read_extended_pid_validation(adapter)
        pid08 = result["pids"]["08"]
        # The reader returns supported=False when _send_pid returns None
        # The orchestrator preserves this and adds reason=NO_DATA
        assert pid08["supported"] is False
        assert pid08["reason"] == "NO_DATA"

    def test_wrong_prefix_returns_unavailable_with_reason(self):
        """PID in bitmap but response has wrong prefix → reason=PREFIX_MISMATCH."""
        adapter = _PrefixMismatchAdapter()
        result = read_extended_pid_validation(adapter)
        pid0b = result["pids"]["0B"]
        assert pid0b["supported"] is True
        assert pid0b["available"] is False
        assert pid0b["reason"] == "PREFIX_MISMATCH"

    def test_invalid_response_returns_unavailable_with_reason(self):
        """PID in bitmap but response has insufficient bytes → reason=INVALID_RESPONSE."""
        adapter = _InvalidResponseAdapter()
        result = read_extended_pid_validation(adapter)
        pid10 = result["pids"]["10"]
        assert pid10["supported"] is True
        assert pid10["available"] is False
        assert pid10["reason"] == "INVALID_RESPONSE"

    def test_reader_results_preserved_without_normalization(self):
        """Reader results are preserved as-is — no overriding supported=False to unavailable."""
        adapter = _NoDataAdapter()
        result = read_extended_pid_validation(adapter)
        pid08 = result["pids"]["08"]
        # PID 08 was in the bitmap, but the reader returned supported=False
        # because _send_pid returned None (empty response).
        # The orchestrator preserves this and adds reason=NO_DATA.
        # It does NOT override to unavailable (which would hide the discrepancy).
        assert "reason" in pid08
        assert pid08["reason"] == "NO_DATA"


# ---------------------------------------------------------------------------
# TestReportFormat
# ---------------------------------------------------------------------------

class TestReportFormat:
    """Validation report contains expected header, sections, and footer."""

    def setup_method(self):
        self.adapter = MockObdAdapter(profile_name="extended_pid_validation")
        self.result = read_extended_pid_validation(self.adapter)
        self.report = self.result["report"]

    def test_report_has_header(self):
        """Report contains header line."""
        assert "===== EXTENDED PID VALIDATION =====" in self.report

    def test_report_has_footer(self):
        """Report contains footer line."""
        assert "===== END VALIDATION =====" in self.report

    def test_report_has_supported_field(self):
        """Report shows Supported: YES/NO for each PID."""
        assert "Supported: YES" in self.report

    def test_report_has_available_field(self):
        """Report shows Available: YES/NO for each PID."""
        assert "Available: YES" in self.report

    def test_report_has_raw_response(self):
        """Report shows Raw Response for available PIDs."""
        assert "Raw Response:" in self.report

    def test_report_has_value(self):
        """Report shows Value for available PIDs."""
        assert "Value:" in self.report

    def test_report_has_pid_name(self):
        """Report shows PID hex code and name."""
        assert "PID 06" in self.report
        assert "STFT Bank 1" in self.report

    def test_report_unavailable_shows_reason(self):
        """Report shows Reason for unavailable PIDs."""
        adapter = _NoDataAdapter()
        result = read_extended_pid_validation(adapter)
        report = result["report"]
        # PID 08 is NO DATA — should show Reason
        assert "Reason:" in report


# ---------------------------------------------------------------------------
# TestSupportMatrixFormat
# ---------------------------------------------------------------------------

class TestSupportMatrixFormat:
    """Support matrix contains expected header and rows."""

    def setup_method(self):
        self.adapter = MockObdAdapter(profile_name="extended_pid_validation")
        self.result = read_extended_pid_validation(self.adapter)
        self.matrix = self.result["support_matrix"]

    def test_matrix_has_header(self):
        """Matrix contains PID | Name | Supported | Available | Value | Reason header."""
        assert "PID" in self.matrix
        assert "Name" in self.matrix
        assert "Supported" in self.matrix
        assert "Available" in self.matrix
        assert "Value" in self.matrix
        assert "Reason" in self.matrix

    def test_matrix_has_separator(self):
        """Matrix contains row separator."""
        assert "---" in self.matrix

    def test_matrix_has_yes_values(self):
        """Matrix shows YES for supported and available PIDs."""
        lines = self.matrix.split("\n")
        data_lines = [l for l in lines if l.strip() and not l.startswith("PID") and not l.startswith("---")]
        assert len(data_lines) == 7  # 7 PIDs
        # At least one line should have YES | YES
        yes_yes_lines = [l for l in data_lines if "YES" in l and l.count("YES") >= 2]
        assert len(yes_yes_lines) > 0

    def test_matrix_unavailable_shows_reason(self):
        """Matrix shows reason text for unavailable PIDs."""
        adapter = _PrefixMismatchAdapter()
        result = read_extended_pid_validation(adapter)
        matrix = result["support_matrix"]
        # PID 0B should show PREFIX_MISMATCH in the Reason column
        assert "PREFIX_MISMATCH" in matrix


# ---------------------------------------------------------------------------
# TestRawResponseInReport
# ---------------------------------------------------------------------------

class TestRawResponseInReport:
    """Each successfully queried PID shows its raw hex response."""

    def setup_method(self):
        self.adapter = MockObdAdapter(profile_name="extended_pid_validation")
        self.result = read_extended_pid_validation(self.adapter)
        self.report = self.result["report"]

    def test_stft_bank1_raw_response(self):
        """PID 06 shows raw response 410680."""
        assert "Raw Response: 410680" in self.report

    def test_ltft_bank1_raw_response(self):
        """PID 07 shows raw response 410780."""
        assert "Raw Response: 410780" in self.report

    def test_maf_raw_response(self):
        """PID 10 shows raw response 41100064."""
        assert "Raw Response: 41100064" in self.report

    def test_map_raw_response(self):
        """PID 0B shows raw response 410B2A."""
        assert "Raw Response: 410B2A" in self.report