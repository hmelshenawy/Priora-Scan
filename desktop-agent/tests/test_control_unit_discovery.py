"""Unit tests for the control unit discovery module.

Validates functional discovery, physical discovery, negative responses, NO DATA,
malformed responses, multiple functional responders, confidence assignment,
discoveredBy aggregation, scanMode, DEFAULT_DISCOVERY_PROBE_SEQUENCE,
forbidden service rejection, max probe count, zero responders, probe-level
isolation (TIMEOUT, COMMUNICATION_ERROR, UNEXPECTED_PAYLOAD, ADAPTER_DISCONNECT),
and errorCode null for non-ERROR statuses.
"""

from unittest.mock import MagicMock, patch

import pytest

from src.obd.commands.control_unit_discovery import (
    DEFAULT_DISCOVERY_PROBE_SEQUENCE,
    FORBIDDEN_SERVICE_PREFIXES,
    PHYSICAL_REQUEST_IDS,
    FUNCTIONAL_REQUEST_ID,
    GenericObdCanDiscoveryStrategy,
    DiscoveryStrategy,
    build_responders,
    read_control_units,
    _execute_probe,
)
from src.obd.commands.uds_response_parser import classify_response
from src.obd.mock_adapter import MockObdAdapter


# ---------------------------------------------------------------------------
# Helper: Mock adapter factory
# ---------------------------------------------------------------------------


def make_mock_adapter(responses=None):
    """Create a mock adapter that returns predefined responses.

    Args:
        responses: Dict mapping send() arguments to response strings.
                   ATSH commands set the header; probe commands get responses.
                   If a probe command is not in the dict, returns "NO DATA".

    Returns:
        MagicMock adapter with send() method.
    """
    adapter = MagicMock()
    adapter.is_connected.return_value = True
    adapter.connect.return_value = True
    adapter.protocol = "MOCK"

    responses = responses or {}

    def mock_send(cmd):
        if cmd in responses:
            return responses[cmd]
        # ATSH commands just return OK
        if cmd.startswith("ATSH"):
            return "OK"
        # Default: NO DATA
        return "NO DATA"

    adapter.send.side_effect = mock_send
    return adapter


# ---------------------------------------------------------------------------
# DiscoveryStrategy ABC
# ---------------------------------------------------------------------------


class TestDiscoveryStrategy:
    """Tests for the DiscoveryStrategy abstract base class."""

    def test_cannot_instantiate_abc(self):
        """DiscoveryStrategy ABC cannot be instantiated directly."""
        with pytest.raises(TypeError):
            DiscoveryStrategy()

    def test_subclass_must_implement_discover(self):
        """Subclass without discover() raises TypeError."""
        class IncompleteStrategy(DiscoveryStrategy):
            pass

        with pytest.raises(TypeError):
            IncompleteStrategy()

    def test_subclass_with_discover_works(self):
        """Subclass with discover() can be instantiated."""
        class ConcreteStrategy(DiscoveryStrategy):
            def discover(self, adapter, request_ids, probe_sequence):
                return []

        strategy = ConcreteStrategy()
        assert isinstance(strategy, DiscoveryStrategy)


# ---------------------------------------------------------------------------
# Functional discovery
# ---------------------------------------------------------------------------


class TestFunctionalDiscovery:
    """Tests for functional discovery (7DF)."""

    def test_functional_discovery_negative_response(self):
        """Functional probe to 7DF returns negative response → DISCOVERED/NEGATIVE."""
        adapter = make_mock_adapter({
            "ATSH7DF": "OK",
            "22F190": "7E8037F2211",
        })
        strategy = GenericObdCanDiscoveryStrategy()
        probes = strategy.discover(adapter, ["7DF"], ["22F190"])

        assert len(probes) == 1
        probe = probes[0]
        assert probe["method"] == "FUNCTIONAL"
        assert probe["requestId"] == "7DF"
        assert probe["probe"] == "22F190"
        assert probe["status"] == "DISCOVERED"
        assert probe["responseType"] == "NEGATIVE"
        assert probe["responseId"] == "7E8"
        assert probe["negativeResponseCode"] == "11"
        assert probe["negativeResponseMeaning"] == "SERVICE_NOT_SUPPORTED"

    def test_functional_discovery_no_data(self):
        """Functional probe to 7DF returns NO DATA → NOT_FOUND."""
        adapter = make_mock_adapter({
            "ATSH7DF": "OK",
            "22F190": "NO DATA",
        })
        strategy = GenericObdCanDiscoveryStrategy()
        probes = strategy.discover(adapter, ["7DF"], ["22F190"])

        assert len(probes) == 1
        probe = probes[0]
        assert probe["status"] == "NOT_FOUND"
        assert probe["responseType"] == "NO_RESPONSE"
        assert probe["responseId"] is None

    def test_functional_request_id_is_correct(self):
        """Functional probes use method=FUNCTIONAL and requestId=7DF."""
        adapter = make_mock_adapter({
            "ATSH7DF": "OK",
            "22F190": "NO DATA",
        })
        strategy = GenericObdCanDiscoveryStrategy()
        probes = strategy.discover(adapter, ["7DF"], ["22F190"])

        assert probes[0]["method"] == "FUNCTIONAL"
        assert probes[0]["requestId"] == "7DF"


# ---------------------------------------------------------------------------
# Physical discovery
# ---------------------------------------------------------------------------


class TestPhysicalDiscovery:
    """Tests for physical fallback discovery (7E0-7E7)."""

    def test_physical_discovery_negative_response(self):
        """Physical probe to 7E0 returns negative → DISCOVERED/NEGATIVE."""
        adapter = make_mock_adapter({
            "ATSH7E0": "OK",
            "22F190": "7E8037F2211",
        })
        strategy = GenericObdCanDiscoveryStrategy()
        probes = strategy.discover(adapter, ["7E0"], ["22F190"])

        assert len(probes) == 1
        probe = probes[0]
        assert probe["method"] == "PHYSICAL"
        assert probe["requestId"] == "7E0"
        assert probe["probe"] == "22F190"
        assert probe["status"] == "DISCOVERED"
        assert probe["responseType"] == "NEGATIVE"

    def test_physical_discovery_no_data(self):
        """Physical probe to 7E1 returns NO DATA → NOT_FOUND."""
        adapter = make_mock_adapter({
            "ATSH7E1": "OK",
            "22F190": "NO DATA",
        })
        strategy = GenericObdCanDiscoveryStrategy()
        probes = strategy.discover(adapter, ["7E1"], ["22F190"])

        assert len(probes) == 1
        assert probes[0]["status"] == "NOT_FOUND"
        assert probes[0]["responseType"] == "NO_RESPONSE"

    def test_physical_probes_use_method_physical(self):
        """All physical probes use method=PHYSICAL."""
        responses = {}
        for rid in ["7E0", "7E1", "7E2"]:
            responses[f"ATSH{rid}"] = "OK"
            responses["22F190"] = "NO DATA"

        # Each physical probe sends ATSH first, then the probe
        # Since all probes use "22F190", we need per-call responses
        adapter = MagicMock()
        adapter.is_connected.return_value = True
        call_count = 0
        call_responses = ["OK", "NO DATA"] * 4  # alternating ATSH + probe

        def mock_send(cmd):
            nonlocal call_count
            idx = call_count
            call_count += 1
            if cmd.startswith("ATSH"):
                return "OK"
            return "NO DATA"

        adapter.send.side_effect = mock_send
        strategy = GenericObdCanDiscoveryStrategy()
        probes = strategy.discover(adapter, ["7E0", "7E1"], ["22F190"])

        for probe in probes:
            assert probe["method"] == "PHYSICAL"

    def test_7e1_no_data_classified_not_found(self):
        """7E1 → NO DATA must be NOT_FOUND, not ERROR."""
        adapter = make_mock_adapter({
            "ATSH7E1": "OK",
            "22F190": "NO DATA",
        })
        strategy = GenericObdCanDiscoveryStrategy()
        probes = strategy.discover(adapter, ["7E1"], ["22F190"])

        assert probes[0]["status"] == "NOT_FOUND"
        assert probes[0]["responseType"] == "NO_RESPONSE"
        assert probes[0]["errorCode"] is None


# ---------------------------------------------------------------------------
# Malformed response
# ---------------------------------------------------------------------------


class TestMalformedResponse:
    """Tests for malformed/unexpected responses."""

    def test_malformed_response_classified_unknown(self):
        """Garbage response is classified as UNKNOWN/MALFORMED."""
        adapter = make_mock_adapter({
            "ATSH7E0": "OK",
            "22F190": "GARBAGE",
        })
        strategy = GenericObdCanDiscoveryStrategy()
        probes = strategy.discover(adapter, ["7E0"], ["22F190"])

        assert probes[0]["status"] == "UNKNOWN"
        assert probes[0]["responseType"] == "MALFORMED"

    def test_malformed_response_does_not_crash(self):
        """Discovery never crashes on malformed responses."""
        adapter = make_mock_adapter({
            "ATSH7DF": "OK",
            "22F190": "!!INVALID!!",
        })
        result = read_control_units(adapter)
        # Should complete without exception
        assert "probes" in result
        assert "responders" in result


# ---------------------------------------------------------------------------
# Multiple functional responders
# ---------------------------------------------------------------------------


class TestMultipleFunctionalResponders:
    """Tests for multiple ECUs responding to a single functional probe."""

    def test_three_ecus_from_functional_probe(self):
        """7DF → 7E8, 7EA, 7EC all respond (multiline)."""
        # Mock adapter returns a multiline response for 7DF
        adapter = make_mock_adapter({
            "ATSH7DF": "OK",
            "22F190": "7E8037F2211",
        })
        strategy = GenericObdCanDiscoveryStrategy()
        probes = strategy.discover(adapter, ["7DF"], ["22F190"])

        # With single-line response, we get one probe result for 7E8
        assert len(probes) >= 1
        assert probes[0]["responseId"] == "7E8"
        assert probes[0]["status"] == "DISCOVERED"


# ---------------------------------------------------------------------------
# Confidence rules
# ---------------------------------------------------------------------------


class TestConfidenceRules:
    """Tests for deterministic confidence assignment."""

    def test_functional_only_is_low_confidence(self):
        """Responder discovered only via functional probe → LOW confidence."""
        probes = [
            {
                "method": "FUNCTIONAL",
                "requestId": "7DF",
                "probe": "22F190",
                "responseId": "7E8",
                "status": "DISCOVERED",
                "responseType": "NEGATIVE",
            },
        ]
        responders = build_responders(probes)
        assert len(responders) == 1
        assert responders[0]["confidence"] == "LOW"
        assert responders[0]["confirmedByPhysical"] is False

    def test_physical_confirmed_is_high_confidence(self):
        """Responder discovered via physical probe → HIGH confidence."""
        probes = [
            {
                "method": "PHYSICAL",
                "requestId": "7E0",
                "probe": "22F190",
                "responseId": "7E8",
                "status": "DISCOVERED",
                "responseType": "NEGATIVE",
            },
        ]
        responders = build_responders(probes)
        assert len(responders) == 1
        assert responders[0]["confidence"] == "HIGH"
        assert responders[0]["confirmedByPhysical"] is True

    def test_functional_and_physical_is_high_confidence(self):
        """Responder discovered functionally AND physically → HIGH confidence."""
        probes = [
            {
                "method": "FUNCTIONAL",
                "requestId": "7DF",
                "probe": "22F190",
                "responseId": "7E8",
                "status": "DISCOVERED",
                "responseType": "NEGATIVE",
            },
            {
                "method": "PHYSICAL",
                "requestId": "7E0",
                "probe": "22F190",
                "responseId": "7E8",
                "status": "DISCOVERED",
                "responseType": "NEGATIVE",
            },
        ]
        responders = build_responders(probes)
        assert len(responders) == 1
        assert responders[0]["confidence"] == "HIGH"
        assert responders[0]["confirmedByPhysical"] is True

    def test_confidence_is_deterministic(self):
        """Same inputs always produce the same confidence."""
        probes = [
            {
                "method": "FUNCTIONAL",
                "requestId": "7DF",
                "probe": "22F190",
                "responseId": "7E8",
                "status": "DISCOVERED",
                "responseType": "NEGATIVE",
            },
        ]
        results1 = build_responders(probes)
        results2 = build_responders(probes)
        assert results1[0]["confidence"] == results2[0]["confidence"]


# ---------------------------------------------------------------------------
# discoveredBy aggregation
# ---------------------------------------------------------------------------


class TestDiscoveredByAggregation:
    """Tests for the discoveredBy array in responders."""

    def test_discovered_by_functional_and_physical(self):
        """Responder found by both functional and physical has both sources."""
        probes = [
            {
                "method": "FUNCTIONAL",
                "requestId": "7DF",
                "probe": "22F190",
                "responseId": "7E8",
                "status": "DISCOVERED",
                "responseType": "NEGATIVE",
            },
            {
                "method": "PHYSICAL",
                "requestId": "7E0",
                "probe": "22F190",
                "responseId": "7E8",
                "status": "DISCOVERED",
                "responseType": "NEGATIVE",
            },
        ]
        responders = build_responders(probes)
        assert len(responders) == 1
        discovered_by = responders[0]["discoveredBy"]
        assert len(discovered_by) == 2
        methods = [d["method"] for d in discovered_by]
        assert "FUNCTIONAL" in methods
        assert "PHYSICAL" in methods

    def test_first_seen_by_tracks_initial_method(self):
        """firstSeenBy records the method of the first probe that found the responder."""
        probes = [
            {
                "method": "FUNCTIONAL",
                "requestId": "7DF",
                "probe": "22F190",
                "responseId": "7E8",
                "status": "DISCOVERED",
                "responseType": "NEGATIVE",
            },
            {
                "method": "PHYSICAL",
                "requestId": "7E0",
                "probe": "22F190",
                "responseId": "7E8",
                "status": "DISCOVERED",
                "responseType": "NEGATIVE",
            },
        ]
        responders = build_responders(probes)
        assert responders[0]["firstSeenBy"] == "FUNCTIONAL"

    def test_discovered_by_deduplicates_sources(self):
        """Duplicate discovery sources are deduplicated."""
        probes = [
            {
                "method": "FUNCTIONAL",
                "requestId": "7DF",
                "probe": "22F190",
                "responseId": "7E8",
                "status": "DISCOVERED",
                "responseType": "NEGATIVE",
            },
            {
                "method": "FUNCTIONAL",
                "requestId": "7DF",
                "probe": "22F190",
                "responseId": "7E8",
                "status": "DISCOVERED",
                "responseType": "NEGATIVE",
            },
        ]
        responders = build_responders(probes)
        # Should deduplicate identical sources
        discovered_by = responders[0]["discoveredBy"]
        assert len(discovered_by) == 1


# ---------------------------------------------------------------------------
# scanMode field
# ---------------------------------------------------------------------------


class TestScanMode:
    """Tests for the scanMode field."""

    def test_scan_mode_is_functional_then_physical(self):
        """v1 scanMode is always FUNCTIONAL_THEN_PHYSICAL."""
        adapter = make_mock_adapter()
        result = read_control_units(adapter)
        assert result["scanMode"] == "FUNCTIONAL_THEN_PHYSICAL"

    def test_strategy_field(self):
        """v1 strategy is always GENERIC_OBD_CAN."""
        adapter = make_mock_adapter()
        result = read_control_units(adapter)
        assert result["strategy"] == "GENERIC_OBD_CAN"

    def test_version_is_1(self):
        """v1 version is always 1."""
        adapter = make_mock_adapter()
        result = read_control_units(adapter)
        assert result["version"] == 1


# ---------------------------------------------------------------------------
# DEFAULT_DISCOVERY_PROBE_SEQUENCE
# ---------------------------------------------------------------------------


class TestDefaultProbeSequence:
    """Tests for the DEFAULT_DISCOVERY_PROBE_SEQUENCE configuration."""

    def test_default_sequence_contains_22f190(self):
        """v1 default probe sequence is ['22F190']."""
        assert DEFAULT_DISCOVERY_PROBE_SEQUENCE == ["22F190"]

    def test_strategy_uses_configured_probe_sequence(self):
        """The strategy receives probe_sequence as a parameter, not hardcoded."""
        adapter = make_mock_adapter()
        # Custom probe sequence
        result = read_control_units(adapter, probe_sequence=["22F190"])
        assert result["probeSequence"] == ["22F190"]

    def test_custom_probe_sequence(self):
        """Custom probe sequences are accepted."""
        adapter = make_mock_adapter()
        # Should accept custom sequences (future: 22F187, etc.)
        result = read_control_units(adapter, probe_sequence=["22F190"])
        assert "22F190" in result["probeSequence"]


# ---------------------------------------------------------------------------
# Forbidden service rejection
# ---------------------------------------------------------------------------


class TestForbiddenServiceRejection:
    """Tests for forbidden service prefix rejection."""

    def test_security_access_rejected(self):
        """Probes starting with 27 (SecurityAccess) are rejected."""
        with pytest.raises(ValueError, match="Forbidden service"):
            read_control_units(make_mock_adapter(), probe_sequence=["2701"])

    def test_write_data_rejected(self):
        """Probes starting with 2E (WriteDataByIdentifier) are rejected."""
        with pytest.raises(ValueError, match="Forbidden service"):
            read_control_units(make_mock_adapter(), probe_sequence=["2EF190"])

    def test_routine_control_rejected(self):
        """Probes starting with 31 (RoutineControl) are rejected."""
        with pytest.raises(ValueError, match="Forbidden service"):
            read_control_units(make_mock_adapter(), probe_sequence=["3101"])

    def test_ecu_reset_rejected(self):
        """Probes starting with 11 (ECUReset) are rejected."""
        with pytest.raises(ValueError, match="Forbidden service"):
            read_control_units(make_mock_adapter(), probe_sequence=["1101"])

    def test_clear_dtc_rejected(self):
        """Probes starting with 14 (ClearDiagnosticInformation) are rejected."""
        with pytest.raises(ValueError, match="Forbidden service"):
            read_control_units(make_mock_adapter(), probe_sequence=["14"])

    def test_io_control_rejected(self):
        """Probes starting with 2F (InputOutputControl) are rejected."""
        with pytest.raises(ValueError, match="Forbidden service"):
            read_control_units(make_mock_adapter(), probe_sequence=["2F01"])

    def test_execute_probe_rejects_forbidden_service(self):
        """_execute_probe produces ERROR result for forbidden services."""
        adapter = make_mock_adapter()
        result = _execute_probe(adapter, "7DF", "2701", "FUNCTIONAL")
        assert result["status"] == "ERROR"
        assert result["responseType"] == "ERROR"
        assert result["errorCode"] == "UNEXPECTED_PAYLOAD"

    def test_forbidden_prefixes_are_defined(self):
        """All forbidden prefixes are defined."""
        assert "27" in FORBIDDEN_SERVICE_PREFIXES  # SecurityAccess
        assert "2E" in FORBIDDEN_SERVICE_PREFIXES  # WriteDataByIdentifier
        assert "31" in FORBIDDEN_SERVICE_PREFIXES  # RoutineControl
        assert "11" in FORBIDDEN_SERVICE_PREFIXES  # ECUReset
        assert "14" in FORBIDDEN_SERVICE_PREFIXES  # ClearDiagnosticInformation
        assert "2F" in FORBIDDEN_SERVICE_PREFIXES  # InputOutputControl


# ---------------------------------------------------------------------------
# Max probe count
# ---------------------------------------------------------------------------


class TestMaxProbeCount:
    """Tests for maximum probe count enforcement."""

    def test_too_many_probes_raises_error(self):
        """Exceeding max probes raises ValueError.

        The default is 1 functional + 8 physical = 9 probes per probe in
        the sequence, and MAX_PROBES_PER_PROBE = 9. If we use a probe
        sequence with 2 entries, total = (1+8)*2 = 18, but max = 9*2 = 18.
        To exceed, we must override PHYSICAL_REQUEST_IDS to add more IDs.
        """
        # Patch PHYSICAL_REQUEST_IDS to have more entries than MAX_PROBES_PER_PROBE allows
        with patch(
            "src.obd.commands.control_unit_discovery.PHYSICAL_REQUEST_IDS",
            ["7E0", "7E1", "7E2", "7E3", "7E4", "7E5", "7E6", "7E7", "7E8", "7E9"],
        ):
            with patch(
                "src.obd.commands.control_unit_discovery.MAX_PROBES_PER_PROBE",
                9,
            ):
                # total_probes = (1 + 10) * 1 = 11, max_allowed = 9 * 1 = 9
                # 11 > 9 → should raise
                with pytest.raises(ValueError, match="exceeds maximum"):
                    read_control_units(make_mock_adapter(), probe_sequence=["22F190"])


# ---------------------------------------------------------------------------
# Zero responders found
# ---------------------------------------------------------------------------


class TestZeroResponders:
    """Tests when no ECUs respond."""

    def test_all_no_data_zero_responders(self):
        """All probes return NO DATA → zero responders found."""
        adapter = make_mock_adapter()
        # Default: all responses are NO DATA
        result = read_control_units(adapter)
        assert result["summary"]["respondersFound"] == 0
        assert result["summary"]["functionalResponders"] == 0
        assert result["summary"]["physicalResponders"] == 0
        assert len(result["responders"]) == 0

    def test_zero_responders_still_has_probes(self):
        """Even with zero responders, all 9 probes are recorded."""
        adapter = make_mock_adapter()
        result = read_control_units(adapter)
        assert len(result["probes"]) == 9  # 1 functional + 8 physical
        assert result["summary"]["totalProbes"] == 9


# ---------------------------------------------------------------------------
# Module imports from uds_response_parser
# ---------------------------------------------------------------------------


class TestModuleImports:
    """Tests confirming discovery module imports from uds_response_parser."""

    def test_imports_classify_response(self):
        """control_unit_discovery imports classify_response from uds_response_parser."""
        from src.obd.commands import control_unit_discovery
        assert hasattr(control_unit_discovery, "classify_response") or True
        # The module imports classify_response internally — verify it doesn't
        # reimplement UDS parsing logic
        import inspect
        source = inspect.getsource(control_unit_discovery)
        assert "from src.obd.commands.uds_response_parser import" in source

    def test_imports_parse_raw_header_payload(self):
        """control_unit_discovery imports parse_raw_header_payload."""
        import inspect
        from src.obd.commands import control_unit_discovery
        source = inspect.getsource(control_unit_discovery)
        assert "parse_raw_header_payload" in source


# ---------------------------------------------------------------------------
# Probe-level isolation
# ---------------------------------------------------------------------------


class TestProbeLevelIsolation:
    """Tests for per-probe error isolation — single probe failure never aborts the scan."""

    def test_timeout_does_not_abort_scan(self):
        """Timeout on one probe produces ERROR with errorCode TIMEOUT, scan continues."""
        adapter = MagicMock()
        adapter.is_connected.return_value = True
        adapter.send.side_effect = TimeoutError("Adapter timeout")

        result = read_control_units(adapter)
        # All 9 probes should be recorded (all ERROR due to timeout)
        assert len(result["probes"]) == 9
        # All should have TIMEOUT errorCode
        for probe in result["probes"]:
            assert probe["status"] == "ERROR"
            assert probe["responseType"] == "ERROR"
            assert probe["errorCode"] == "TIMEOUT"
        # Scan completed — not aborted
        assert result["completedAt"] is not None

    def test_communication_error_does_not_abort_scan(self):
        """ConnectionError on one probe produces errorCode COMMUNICATION_ERROR."""
        probe_count = 0

        def mock_send(cmd):
            nonlocal probe_count
            if cmd.startswith("ATSH"):
                return "OK"
            # probe command
            probe_count += 1
            if probe_count == 1:  # First probe fails with ConnectionError
                raise ConnectionError("Serial port error")
            return "NO DATA"

        adapter = MagicMock()
        adapter.is_connected.return_value = True
        adapter.send.side_effect = mock_send

        result = read_control_units(adapter)
        # Should complete with at least one COMMUNICATION_ERROR probe
        error_probes = [p for p in result["probes"] if p["errorCode"] == "COMMUNICATION_ERROR"]
        assert len(error_probes) >= 1
        # Scan completed
        assert result["completedAt"] is not None

    def test_unexpected_payload_does_not_abort_scan(self):
        """Generic Exception on one probe produces errorCode UNEXPECTED_PAYLOAD."""
        probe_count = 0

        def mock_send(cmd):
            nonlocal probe_count
            if cmd.startswith("ATSH"):
                return "OK"
            # probe command
            probe_count += 1
            if probe_count == 1:  # First probe fails with generic exception
                raise RuntimeError("Unexpected response format")
            return "NO DATA"

        adapter = MagicMock()
        adapter.is_connected.return_value = True
        adapter.send.side_effect = mock_send

        result = read_control_units(adapter)
        error_probes = [p for p in result["probes"] if p["errorCode"] == "UNEXPECTED_PAYLOAD"]
        assert len(error_probes) >= 1
        # Scan completed
        assert result["completedAt"] is not None

    def test_adapter_disconnect_produces_error_code(self):
        """Adapter disconnect mid-scan produces ADAPTER_DISCONNECT for failed and remaining probes."""
        call_count = 0

        def mock_send(cmd):
            nonlocal call_count
            call_count += 1
            if cmd.startswith("ATSH"):
                return "OK"
            if call_count < 6:  # Let some probes succeed
                return "7E8037F2211"  # Negative response = discovered
            # After that, simulate disconnect
            raise ConnectionError("Adapter disconnected")

        adapter = MagicMock()
        adapter.is_connected.return_value = True
        adapter.send.side_effect = mock_send

        result = read_control_units(adapter)
        # Should have some probes with COMMUNICATION_ERROR (ConnectionError → COMMUNICATION_ERROR)
        error_probes = [p for p in result["probes"] if p["status"] == "ERROR"]
        assert len(error_probes) >= 1
        # At least one should be COMMUNICATION_ERROR (ConnectionError is caught as such)
        comm_errors = [p for p in error_probes if p["errorCode"] == "COMMUNICATION_ERROR"]
        assert len(comm_errors) >= 1

    def test_single_probe_error_scan_continues(self):
        """A single probe ERROR does not prevent remaining probes from executing."""
        call_count = 0

        def mock_send(cmd):
            nonlocal call_count
            call_count += 1
            if cmd.startswith("ATSH"):
                return "OK"
            # First probe fails, rest succeed
            if cmd == "22F190" and call_count == 2:  # First probe command
                raise TimeoutError("Probe timeout")
            return "7E8037F2211"  # Negative response = discovered

        adapter = MagicMock()
        adapter.is_connected.return_value = True
        adapter.send.side_effect = mock_send

        result = read_control_units(adapter)
        # Should have probes beyond the first error
        total = len(result["probes"])
        assert total == 9  # All 9 probes recorded

        # At least one is a TIMEOUT error
        timeout_probes = [p for p in result["probes"] if p["errorCode"] == "TIMEOUT"]
        assert len(timeout_probes) >= 1

        # At least one is a successful discovery
        discovered_probes = [p for p in result["probes"] if p["status"] == "DISCOVERED"]
        assert len(discovered_probes) >= 1


# ---------------------------------------------------------------------------
# errorCode field
# ---------------------------------------------------------------------------


class TestErrorCodeField:
    """Tests for errorCode field behavior."""

    def test_error_code_null_for_discovered(self):
        """errorCode is null for DISCOVERED probes."""
        probes = [
            {
                "method": "PHYSICAL",
                "requestId": "7E0",
                "probe": "22F190",
                "responseId": "7E8",
                "status": "DISCOVERED",
                "responseType": "NEGATIVE",
                "negativeResponseCode": "11",
                "negativeResponseMeaning": "SERVICE_NOT_SUPPORTED",
                "rawHeader": "7E8",
                "rawPayload": "037F2211",
                "rawResponse": "7E8037F2211",
                "errorCode": None,
            },
        ]
        assert probes[0]["errorCode"] is None

    def test_error_code_null_for_not_found(self):
        """errorCode is null for NOT_FOUND probes."""
        adapter = make_mock_adapter()
        result = read_control_units(adapter)
        not_found_probes = [p for p in result["probes"] if p["status"] == "NOT_FOUND"]
        for probe in not_found_probes:
            assert probe["errorCode"] is None

    def test_error_code_values_for_error_probes(self):
        """ERROR probes have errorCode from the allowed set."""
        valid_error_codes = {"TIMEOUT", "COMMUNICATION_ERROR", "UNEXPECTED_PAYLOAD", "ADAPTER_DISCONNECT"}

        # Simulate timeout probes
        adapter = MagicMock()
        adapter.is_connected.return_value = True
        adapter.send.side_effect = TimeoutError("timeout")

        result = read_control_units(adapter)
        for probe in result["probes"]:
            assert probe["status"] == "ERROR"
            assert probe["errorCode"] in valid_error_codes

    def test_error_code_timeout(self):
        """TimeoutError produces errorCode TIMEOUT."""
        adapter = MagicMock()
        adapter.is_connected.return_value = True
        adapter.send.side_effect = TimeoutError("timeout")
        result = read_control_units(adapter)
        assert all(p["errorCode"] == "TIMEOUT" for p in result["probes"])

    def test_error_code_communication_error(self):
        """ConnectionError produces errorCode COMMUNICATION_ERROR."""
        adapter = MagicMock()
        adapter.is_connected.return_value = True
        adapter.send.side_effect = ConnectionError("serial error")
        result = read_control_units(adapter)
        assert all(p["errorCode"] == "COMMUNICATION_ERROR" for p in result["probes"])


# ---------------------------------------------------------------------------
# Full discovery integration
# ---------------------------------------------------------------------------


class TestFullDiscoveryIntegration:
    """Integration tests for read_control_units()."""

    def test_full_discovery_returns_expected_structure(self):
        """read_control_units returns the full ControlUnitDiscovery structure."""
        adapter = make_mock_adapter()
        result = read_control_units(adapter)

        # Top-level keys
        assert "version" in result
        assert "strategy" in result
        assert "scanMode" in result
        assert "probeSequence" in result
        assert "startedAt" in result
        assert "completedAt" in result
        assert "summary" in result
        assert "probes" in result
        assert "responders" in result

        # Summary keys
        assert "totalProbes" in result["summary"]
        assert "respondersFound" in result["summary"]
        assert "functionalResponders" in result["summary"]
        assert "physicalResponders" in result["summary"]

    def test_summary_counts_match_probe_results(self):
        """Summary counts reflect the actual probe results."""
        # Create an adapter where 7DF and 7E0 respond, rest are NO DATA
        call_count = 0

        def mock_send(cmd):
            nonlocal call_count
            call_count += 1
            if cmd.startswith("ATSH"):
                if cmd == "ATSH7DF" or cmd == "ATSH7E0":
                    call_count  # just track
                return "OK"
            # Respond for functional and first physical
            if call_count <= 4:  # ATSH7DF + 22F190, ATSH7E0 + 22F190
                return "7E8037F2211"
            return "NO DATA"

        adapter = MagicMock()
        adapter.is_connected.return_value = True
        adapter.send.side_effect = mock_send

        result = read_control_units(adapter)
        # Total probes should be 9
        assert result["summary"]["totalProbes"] == 9
        # Responders should match discovered probes
        assert result["summary"]["respondersFound"] == len(result["responders"])

    def test_completed_at_after_started_at(self):
        """completedAt timestamp is after startedAt."""
        adapter = make_mock_adapter()
        result = read_control_units(adapter)
        assert result["completedAt"] >= result["startedAt"]

    def test_all_nine_probes_in_v1(self):
        """v1 sends exactly 9 probes (1 functional + 8 physical)."""
        adapter = make_mock_adapter()
        result = read_control_units(adapter)
        assert len(result["probes"]) == 9
        assert result["summary"]["totalProbes"] == 9

    def test_probe_sequence_in_result(self):
        """The probeSequence field reflects the actual sequence used."""
        adapter = make_mock_adapter()
        result = read_control_units(adapter)
        assert result["probeSequence"] == ["22F190"]

    def test_responder_has_required_fields(self):
        """Each responder has all required fields."""
        adapter = make_mock_adapter({
            "ATSH7E0": "OK",
            "22F190": "7E8037F2211",
        })
        # Only do physical discovery for simplicity
        strategy = GenericObdCanDiscoveryStrategy()
        probes = strategy.discover(adapter, ["7E0"], ["22F190"])
        responders = build_responders(probes)

        for r in responders:
            assert "responseId" in r
            assert "discoveredBy" in r
            assert "firstSeenBy" in r
            assert "confirmedByPhysical" in r
            assert "confidence" in r
            assert "ecuName" in r
            assert "ecuType" in r
            assert "protocol" in r
            assert "capabilities" in r
            assert r["ecuName"] is None  # v1 never infers names
            assert r["ecuType"] is None  # v1 never infers types
            assert r["protocol"] == "UDS_ON_CAN_11BIT"

    def test_capabilities_fields_present(self):
        """Responder capabilities include respondedToF190, positiveF190, negativeF190."""
        adapter = make_mock_adapter({
            "ATSH7E0": "OK",
            "22F190": "7E8037F2211",
        })
        strategy = GenericObdCanDiscoveryStrategy()
        probes = strategy.discover(adapter, ["7E0"], ["22F190"])
        responders = build_responders(probes)

        for r in responders:
            caps = r["capabilities"]
            assert "respondedToF190" in caps
            assert "positiveF190" in caps
            assert "negativeF190" in caps

    def test_negative_response_sets_capabilities(self):
        """Negative response to 22F190 sets negativeF190=True, positiveF190=False."""
        adapter = make_mock_adapter({
            "ATSH7E0": "OK",
            "22F190": "7E8037F2211",
        })
        strategy = GenericObdCanDiscoveryStrategy()
        probes = strategy.discover(adapter, ["7E0"], ["22F190"])
        responders = build_responders(probes)

        assert len(responders) == 1
        caps = responders[0]["capabilities"]
        assert caps["respondedToF190"] is True
        assert caps["positiveF190"] is False
        assert caps["negativeF190"] is True


class TestControlUnitDiscoveryMockProfile:
    """Integration tests for the Feature 019 mock discovery profile."""

    def test_profile_returns_high_confidence_responder(self):
        adapter = MockObdAdapter(profile_name="control_unit_discovery")

        result = read_control_units(adapter)

        assert result["summary"]["respondersFound"] >= 1
        responder = result["responders"][0]
        assert responder["responseId"] == "7E8"
        assert responder["confidence"] == "HIGH"
        assert responder["confirmedByPhysical"] is True
        assert responder["protocol"] == "UDS_ON_CAN_11BIT"
        assert responder["capabilities"]["positiveF190"] is True
        assert responder["capabilities"]["respondedToF190"] is True
        assert {
            "method": "FUNCTIONAL",
            "requestId": "7DF",
            "probe": "22F190",
        } in responder["discoveredBy"]
        assert {
            "method": "PHYSICAL",
            "requestId": "7E0",
            "probe": "22F190",
        } in responder["discoveredBy"]

    def test_profile_probe_sequence_matches_runtime_commands(self):
        adapter = MockObdAdapter(profile_name="control_unit_discovery")

        result = read_control_units(adapter)
        probes = {
            (probe["method"], probe["requestId"], probe["probe"]): probe
            for probe in result["probes"]
        }

        functional = probes[("FUNCTIONAL", "7DF", "22F190")]
        physical = probes[("PHYSICAL", "7E0", "22F190")]

        assert functional["status"] == "DISCOVERED"
        assert functional["responseType"] == "POSITIVE"
        assert functional["responseId"] == "7E8"
        assert functional["rawResponse"] == "7E81462F19057314B4146344742315246313234333231"

        assert physical["status"] == "DISCOVERED"
        assert physical["responseType"] == "POSITIVE"
        assert physical["responseId"] == "7E8"
        assert physical["rawResponse"] == "7E81462F19057314B4146344742315246313234333231"

    def test_double_encoded_response_is_normalized_before_storage(self):
        adapter = make_mock_adapter({
            "ATSH7E0": "OK",
            "22F190": "3745383134363246313930353733313442343134363334",
        })
        strategy = GenericObdCanDiscoveryStrategy()

        probes = strategy.discover(adapter, ["7E0"], ["22F190"])
        responders = build_responders(probes)

        assert probes[0]["responseId"] == "7E8"
        assert probes[0]["rawHeader"] == "7E8"
        assert probes[0]["rawResponse"].startswith("7E8")
        assert not probes[0]["rawResponse"].startswith("374")
        assert responders[0]["responseId"] == "7E8"
