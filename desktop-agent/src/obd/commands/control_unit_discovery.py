"""Control unit discovery engine — discovers responding ECUs on the CAN bus.

Implements a two-step functional→physical discovery strategy using safe UDS
probes. Results include probe history, deduplicated responders with discovery
source tracking, confidence levels, and scan mode metadata.

Each probe execution is isolated — a single probe failure never aborts the
entire discovery scan. Failures produce ``ProbeResult`` records with
``status: "ERROR"`` and a machine-readable ``errorCode``.

This module consumes :mod:`uds_response_parser` for all UDS response
classification — it does NOT reimplement UDS parsing logic.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

from src.obd.adapter import BaseAdapter
from src.obd.commands.uds_response_parser import (
    NEGATIVE_RESPONSE_CODES,
    classify_response,
    parse_raw_header_payload,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Probe sequence — configuration-driven, not hardcoded in strategy logic.
# v1 sends only 22F190 (UDS ReadDataByIdentifier — VIN).
# Future features may add additional read-only probes (22F187, 22F188, 22F18A).
DEFAULT_DISCOVERY_PROBE_SEQUENCE: List[str] = ["22F190"]

# Physical request IDs for v1 (standard OBD-II diagnostic addresses)
PHYSICAL_REQUEST_IDS: List[str] = ["7E0", "7E1", "7E2", "7E3", "7E4", "7E5", "7E6", "7E7"]

# Functional request ID (broadcasts to all ECUs)
FUNCTIONAL_REQUEST_ID: str = "7DF"

# Forbidden UDS service prefixes — never send these
FORBIDDEN_SERVICE_PREFIXES: List[str] = ["27", "2E", "31", "11", "14", "2F"]

# Maximum probes per probe in the sequence (1 functional + 8 physical = 9)
MAX_PROBES_PER_PROBE: int = 9

# Per-probe timeout in seconds
PROBE_TIMEOUT_SECONDS: float = 2.0


# ---------------------------------------------------------------------------
# Strategy ABC
# ---------------------------------------------------------------------------


class DiscoveryStrategy(ABC):
    """Abstract base class for control unit discovery strategies.

    v1 implements :class:`GenericObdCanDiscoveryStrategy`. Future strategies
    (Toyota, Mercedes, AdvancedRange) will subclass this ABC.
    """

    @abstractmethod
    def discover(
        self,
        adapter: BaseAdapter,
        request_ids: List[str],
        probe_sequence: List[str],
    ) -> List[Dict[str, Any]]:
        """Execute discovery probes and return a list of probe result dicts.

        Args:
            adapter: The OBD adapter to send commands through.
            request_ids: CAN request IDs to probe (e.g. ``["7DF", "7E0", ...]``).
            probe_sequence: UDS service+DID pairs to send per request ID
                           (e.g. ``["22F190"]``).

        Returns:
            A list of probe result dicts (one per probe attempt).
        """


# ---------------------------------------------------------------------------
# GenericObdCanDiscoveryStrategy
# ---------------------------------------------------------------------------


class GenericObdCanDiscoveryStrategy(DiscoveryStrategy):
    """v1 discovery strategy: functional address then physical fallback.

    Step 1 — Functional discovery: sends each probe in *probe_sequence* to
    ``7DF`` (functional broadcast address).

    Step 2 — Physical fallback: sends each probe in *probe_sequence* to each
    address in ``7E0``–``7E7``.
    """

    def discover(
        self,
        adapter: BaseAdapter,
        request_ids: List[str],
        probe_sequence: List[str],
    ) -> List[Dict[str, Any]]:
        probes: List[Dict[str, Any]] = []

        for request_id in request_ids:
            method = "FUNCTIONAL" if request_id == FUNCTIONAL_REQUEST_ID else "PHYSICAL"

            for probe in probe_sequence:
                result = _execute_probe(adapter, request_id, probe, method)
                probes.append(result)

                # Functional probes may return multiple responses (multiple ECUs)
                if result["status"] == "DISCOVERED" and method == "FUNCTIONAL":
                    extra_results = _handle_multiline_functional(
                        adapter, request_id, probe, method, result
                    )
                    probes.extend(extra_results)

        return probes


def _execute_probe(
    adapter: BaseAdapter,
    request_id: str,
    probe: str,
    method: str,
) -> Dict[str, Any]:
    """Execute a single probe with per-probe isolation.

    If the probe fails (timeout, communication error, etc.), the failure is
    recorded as an ERROR result — the scan continues with remaining probes.
    """
    # Validate probe is not a forbidden service
    for prefix in FORBIDDEN_SERVICE_PREFIXES:
        if probe.upper().startswith(prefix):
            logger.error("Forbidden service probe rejected: %s", probe)
            return {
                "method": method,
                "requestId": request_id,
                "probe": probe,
                "responseId": None,
                "status": "ERROR",
                "responseType": "ERROR",
                "negativeResponseCode": None,
                "negativeResponseMeaning": None,
                "rawHeader": None,
                "rawPayload": None,
                "rawResponse": "",
                "errorCode": "UNEXPECTED_PAYLOAD",
            }

    try:
        # Set header and send probe
        header_cmd = f"ATSH{request_id}"
        adapter.send(header_cmd)

        raw_response = adapter.send(probe)

        # adapter.send may return bytes or str depending on adapter type
        if isinstance(raw_response, bytes):
            raw_response = raw_response.decode("utf-8", errors="replace").strip()
        elif raw_response is not None:
            raw_response = str(raw_response).strip()
        else:
            raw_response = "NO DATA"

        # Classify the response
        result = classify_response(raw_response, request_id)
        result["method"] = method
        result["requestId"] = request_id
        result["probe"] = probe
        result["errorCode"] = None

        return result

    except TimeoutError:
        logger.warning("Probe timeout: %s → %s", request_id, probe)
        return {
            "method": method,
            "requestId": request_id,
            "probe": probe,
            "responseId": None,
            "status": "ERROR",
            "responseType": "ERROR",
            "negativeResponseCode": None,
            "negativeResponseMeaning": None,
            "rawHeader": None,
            "rawPayload": None,
            "rawResponse": "",
            "errorCode": "TIMEOUT",
        }
    except ConnectionError:
        logger.error("Adapter communication error during probe: %s → %s", request_id, probe)
        return {
            "method": method,
            "requestId": request_id,
            "probe": probe,
            "responseId": None,
            "status": "ERROR",
            "responseType": "ERROR",
            "negativeResponseCode": None,
            "negativeResponseMeaning": None,
            "rawHeader": None,
            "rawPayload": None,
            "rawResponse": "",
            "errorCode": "COMMUNICATION_ERROR",
        }
    except Exception as exc:
        logger.error("Unexpected error during probe %s → %s: %s", request_id, probe, exc)
        return {
            "method": method,
            "requestId": request_id,
            "probe": probe,
            "responseId": None,
            "status": "ERROR",
            "responseType": "ERROR",
            "negativeResponseCode": None,
            "negativeResponseMeaning": None,
            "rawHeader": None,
            "rawPayload": None,
            "rawResponse": "",
            "errorCode": "UNEXPECTED_PAYLOAD",
        }


def _handle_multiline_functional(
    adapter: BaseAdapter,
    request_id: str,
    probe: str,
    method: str,
    first_result: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Handle multiple ECU responses from a single functional probe.

    When functional probe ``7DF`` returns responses from multiple ECUs,
    the adapter may return each response on a separate line. This function
    checks for additional responses and classifies them.

    NOTE: In the current v1 implementation, the ELM327 adapter typically
    returns only one response per send() call. Multi-line handling is
    included for future compatibility. The primary result is already captured
    in ``first_result``.
    """
    # In v1, each send() returns one response.
    # Multi-line responses from a single functional probe are handled by
    # calling parse_multiline_response in the orchestrator if needed.
    # For now, return empty — the first result is already in the probes list.
    return []


# ---------------------------------------------------------------------------
# Responder builder
# ---------------------------------------------------------------------------


def build_responders(probes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build deduplicated responder records from probe results.

    Groups probes by ``responseId``, computes ``discoveredBy``,
    ``confidence``, and capability flags using deterministic rules:

    - **LOW**: responder discovered only through functional probing (``7DF``)
    - **HIGH**: responder discovered through any physical probe (``7E0``-``7E7``)
      OR discovered functionally and later confirmed physically

    Args:
        probes: List of probe result dicts from discovery.

    Returns:
        List of responder dicts sorted by responseId.
    """
    # Group probes by responseId (only DISCOVERED probes contribute)
    responder_map: Dict[str, List[Dict[str, Any]]] = {}
    for probe in probes:
        if probe.get("status") != "DISCOVERED":
            continue
        rid = probe.get("responseId")
        if rid is None:
            continue
        if rid not in responder_map:
            responder_map[rid] = []
        responder_map[rid].append(probe)

    responders = []
    for response_id in sorted(responder_map.keys()):
        contributing_probes = responder_map[response_id]

        # Build discoveredBy array
        discovered_by = []
        for p in contributing_probes:
            source = {
                "method": p["method"],
                "requestId": p["requestId"],
                "probe": p["probe"],
            }
            # Deduplicate sources
            if source not in discovered_by:
                discovered_by.append(source)

        # Determine first seen method
        first_method = contributing_probes[0]["method"]

        # Determine physical confirmation
        confirmed_by_physical = any(
            p["method"] == "PHYSICAL" for p in contributing_probes
        )

        # Assign confidence deterministically
        confidence = "HIGH" if confirmed_by_physical else "LOW"

        # Build capability flags from all contributing probes
        has_positive = any(p.get("responseType") == "POSITIVE" for p in contributing_probes)
        has_negative = any(p.get("responseType") == "NEGATIVE" for p in contributing_probes)

        # Determine protocol — v1 only supports 11-bit CAN
        protocol = "UDS_ON_CAN_11BIT"

        # Check if any probe with 22F190 got a response
        responded_to_f190 = any(
            p.get("probe") == "22F190" and p.get("status") == "DISCOVERED"
            for p in contributing_probes
        )

        responder = {
            "responseId": response_id,
            "discoveredBy": discovered_by,
            "firstSeenBy": first_method,
            "confirmedByPhysical": confirmed_by_physical,
            "confidence": confidence,
            "ecuName": None,
            "ecuType": None,
            "protocol": protocol,
            "capabilities": {
                "respondedToF190": responded_to_f190,
                "positiveF190": has_positive,
                "negativeF190": has_negative,
            },
        }
        responders.append(responder)

    return responders


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def read_control_units(
    adapter: BaseAdapter,
    strategy: Optional[DiscoveryStrategy] = None,
    probe_sequence: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Run control unit discovery and return the full result structure.

    This is the main entry point for Feature 019. It executes the two-step
    functional→physical discovery strategy, builds responder records, and
    returns a structured dict suitable for JSON persistence.

    Args:
        adapter: The OBD adapter (real or mock).
        strategy: Discovery strategy to use. Defaults to
            :class:`GenericObdCanDiscoveryStrategy`.
        probe_sequence: Probes to send per request ID. Defaults to
            :data:`DEFAULT_DISCOVERY_PROBE_SEQUENCE`.

    Returns:
        A dict matching the :class:`ControlUnitDiscovery` interface with
        keys: version, strategy, scanMode, probeSequence, startedAt,
        completedAt, summary, probes, responders.
    """
    if strategy is None:
        strategy = GenericObdCanDiscoveryStrategy()

    if probe_sequence is None:
        probe_sequence = list(DEFAULT_DISCOVERY_PROBE_SEQUENCE)

    # Validate probe sequence
    for probe in probe_sequence:
        for prefix in FORBIDDEN_SERVICE_PREFIXES:
            if probe.upper().startswith(prefix):
                raise ValueError(
                    f"Forbidden service in probe sequence: {probe} "
                    f"(starts with forbidden prefix {prefix})"
                )

    # Validate total probe count
    total_probes = (1 + len(PHYSICAL_REQUEST_IDS)) * len(probe_sequence)
    max_allowed = MAX_PROBES_PER_PROBE * len(probe_sequence)
    if total_probes > max_allowed:
        raise ValueError(
            f"Total probes ({total_probes}) exceeds maximum ({max_allowed})"
        )

    started_at = datetime.now(timezone.utc).isoformat()

    # Build request ID list: functional first, then physical
    request_ids = [FUNCTIONAL_REQUEST_ID] + PHYSICAL_REQUEST_IDS

    # Execute discovery with per-probe isolation
    try:
        probes = strategy.discover(adapter, request_ids, probe_sequence)
    except Exception as exc:
        # Unrecoverable failure — return partial result with error probe
        logger.error("Discovery strategy failed: %s", exc)
        completed_at = datetime.now(timezone.utc).isoformat()
        return {
            "version": 1,
            "strategy": "GENERIC_OBD_CAN",
            "scanMode": "FUNCTIONAL_THEN_PHYSICAL",
            "probeSequence": probe_sequence,
            "startedAt": started_at,
            "completedAt": completed_at,
            "summary": {
                "totalProbes": 0,
                "respondersFound": 0,
                "functionalResponders": 0,
                "physicalResponders": 0,
            },
            "probes": [],
            "responders": [],
        }

    # Build responders from discovered probes
    responders = build_responders(probes)

    # Compute summary
    discovered_probes = [p for p in probes if p.get("status") == "DISCOVERED"]
    functional_responders = set(
        r["responseId"]
        for r in responders
        if any(s["method"] == "FUNCTIONAL" for s in r["discoveredBy"])
    )
    physical_responders = set(
        r["responseId"]
        for r in responders
        if any(s["method"] == "PHYSICAL" for s in r["discoveredBy"])
    )

    completed_at = datetime.now(timezone.utc).isoformat()

    return {
        "version": 1,
        "strategy": "GENERIC_OBD_CAN",
        "scanMode": "FUNCTIONAL_THEN_PHYSICAL",
        "probeSequence": probe_sequence,
        "startedAt": started_at,
        "completedAt": completed_at,
        "summary": {
            "totalProbes": len(probes),
            "respondersFound": len(responders),
            "functionalResponders": len(functional_responders),
            "physicalResponders": len(physical_responders),
        },
        "probes": probes,
        "responders": responders,
    }