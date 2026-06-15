"""Reusable UDS response parser for OBD/UDS diagnostic commands.

Provides response classification, header/payload extraction, and negative
response code mapping. Shared by Feature 019 (Control Unit Discovery) and
future features 020 (ECU Inventory), 021 (ECU-Specific DTC), and
022 (UDS Explorer).

This module does NOT own discovery or business logic — it only parses and
classifies raw ELM327 responses.
"""

from __future__ import annotations

from typing import Dict, Optional, Tuple

# ---------------------------------------------------------------------------
# Negative Response Code mapping (UDS ISO 14229-1)
# ---------------------------------------------------------------------------

NEGATIVE_RESPONSE_CODES: Dict[str, str] = {
    "11": "SERVICE_NOT_SUPPORTED",
    "12": "SUB_FUNCTION_NOT_SUPPORTED",
    "13": "INCORRECT_MESSAGE_LENGTH_OR_INVALID_FORMAT",
    "22": "CONDITIONS_NOT_CORRECT",
    "31": "REQUEST_OUT_OF_RANGE",
    "33": "SECURITY_ACCESS_DENIED",
    "78": "RESPONSE_PENDING",
}


def _normalize_raw_response(raw_response: str) -> str:
    """Normalize readable ELM/UDS response text before parsing.

    Mock and adapter layers should pass strings like ``7E81462F190...``.
    A previous mock path could accidentally pass the ASCII bytes for that
    string as hex text (``3745383134...``). Normalize that form back to the
    readable response so CAN IDs are stored as ``7E8`` rather than ``374``.
    """
    if not raw_response:
        return ""

    raw = raw_response.strip()
    compact = raw.upper().replace(" ", "")
    if len(compact) < 6 or len(compact) % 2 != 0:
        return raw

    try:
        decoded = bytes.fromhex(compact).decode("ascii")
    except (ValueError, UnicodeDecodeError):
        return raw

    decoded_compact = decoded.strip().upper().replace(" ", "")
    if len(decoded_compact) < 5:
        return raw

    try:
        int(decoded_compact, 16)
    except ValueError:
        return raw

    if decoded_compact.startswith(("7E", "7DF", "7F")):
        return decoded.strip().upper()

    return raw


def extract_negative_response(
    raw_response: str,
) -> Tuple[Optional[str], Optional[str]]:
    """Extract the NRC service byte and NRC code from a negative response.

    A UDS negative response has the format: ``7F <SID> <NRC>``.
    The raw response may include a CAN header prefix (e.g. ``7E8``).

    Args:
        raw_response: The raw hex response string from the adapter.

    Returns:
        A tuple of ``(nrc_service_byte, nrc_code)``.
        Returns ``(None, None)`` if the response is not a negative response
        or cannot be parsed.
    """
    raw_response = _normalize_raw_response(raw_response)

    if not raw_response or raw_response.strip().upper() == "NO DATA":
        return None, None

    hex_str = raw_response.strip().upper().replace(" ", "")

    # Look for the 7F marker — negative response identifier
    idx = hex_str.find("7F")
    if idx == -1:
        return None, None

    # After 7F: service byte + NRC byte (minimum 2 hex chars each = 4 chars)
    remainder = hex_str[idx + 2 :]
    if len(remainder) < 4:
        return None, None

    nrc_service = remainder[:2]
    nrc_code = remainder[2:4]

    return nrc_service, nrc_code


def parse_raw_header_payload(
    raw_response: str,
) -> Tuple[Optional[str], Optional[str]]:
    """Extract the CAN response header and payload bytes from a raw response.

    The ELM327 adapter returns responses with the CAN header (typically 3 hex
    chars for 11-bit addressing) followed by the payload bytes.

    Examples::

        >>> parse_raw_header_payload("7E8037F2211")
        ("7E8", "037F2211")
        >>> parse_raw_header_payload("7E80662F190...")
        ("7E8", "0662F190...")
        >>> parse_raw_header_payload("NO DATA")
        (None, None)
        >>> parse_raw_header_payload("GARBAGE")
        (None, None)

    Args:
        raw_response: The raw hex response string from the adapter.

    Returns:
        A tuple of ``(header, payload)``.
        Returns ``(None, None)`` for ``NO DATA`` or unparseable responses.
    """
    raw_response = _normalize_raw_response(raw_response)

    if not raw_response:
        return None, None

    stripped = raw_response.strip().upper()

    if stripped == "NO DATA" or not stripped:
        return None, None

    hex_str = stripped.replace(" ", "")

    # Minimum valid response: 3-char header + at least 1 byte payload
    if len(hex_str) < 5:
        return None, None

    # Validate all characters are hex
    try:
        int(hex_str, 16)
    except ValueError:
        return None, None

    # First 3 hex chars = CAN header (11-bit CAN ID)
    header = hex_str[:3]
    payload = hex_str[3:]

    return header, payload


def classify_response(
    raw_response: str,
    request_id: str,
) -> Dict[str, Optional[str]]:
    """Classify a raw ELM327 response into a structured probe result.

    Categories:

    - **POSITIVE**: Service supported, response starts with ``6X``.
    - **NEGATIVE**: ECU responded with UDS NRC (``7F`` prefix).
    - **NO_RESPONSE**: Adapter returned ``NO DATA``.
    - **MALFORMED**: Unparseable response.

    For each category, the returned dict contains the appropriate fields:

    ======== ============ ======== ========== ======= ========= ==========
    Category status       respType  respId     header  payload   nrcCode
    ======== ============ ======== ========== ======= ========= ==========
    POSITIVE DISCOVERED   POSITIVE extracted  extracted extracted None
    NEGATIVE DISCOVERED   NEGATIVE extracted  extracted extracted mapped
    NO_RESP  NOT_FOUND    NO_RESP  None      None    None      None
    MALFORMED UNKNOWN      MALFORMED extracted None    None      None
    ======== ============ ======== ========== ======= ========= ==========

    For **multiple responders** from a single functional probe (e.g. ``7DF``),
    call :func:`parse_multiline_response` first to split, then classify each
    line individually.

    Args:
        raw_response: The raw response string from the adapter.
        request_id: The CAN request ID that was sent (e.g. ``"7DF"``, ``"7E0"``).

    Returns:
        A dict with keys: ``status``, ``responseType``, ``responseId``,
        ``rawHeader``, ``rawPayload``, ``rawResponse``, ``negativeResponseCode``,
        ``negativeResponseMeaning``.
    """
    raw = _normalize_raw_response(raw_response).strip() if raw_response else ""

    # --- NO DATA ---
    if not raw or raw.upper() == "NO DATA":
        return {
            "status": "NOT_FOUND",
            "responseType": "NO_RESPONSE",
            "responseId": None,
            "rawHeader": None,
            "rawPayload": None,
            "rawResponse": raw or "NO DATA",
            "negativeResponseCode": None,
            "negativeResponseMeaning": None,
        }

    hex_str = raw.upper().replace(" ", "")

    # --- Validate hex ---
    try:
        int(hex_str, 16)
    except ValueError:
        return {
            "status": "UNKNOWN",
            "responseType": "MALFORMED",
            "responseId": None,
            "rawHeader": None,
            "rawPayload": None,
            "rawResponse": raw,
            "negativeResponseCode": None,
            "negativeResponseMeaning": None,
        }

    # --- Parse header and payload ---
    header, payload = parse_raw_header_payload(raw)
    response_id = header  # For 11-bit CAN, header IS the response ID

    # --- NEGATIVE response (7F prefix) ---
    if "7F" in hex_str:
        nrc_service, nrc_code = extract_negative_response(raw)
        if nrc_code:
            meaning = NEGATIVE_RESPONSE_CODES.get(
                nrc_code, "UNKNOWN_NEGATIVE_RESPONSE"
            )
        else:
            nrc_code = None
            meaning = None

        return {
            "status": "DISCOVERED",
            "responseType": "NEGATIVE",
            "responseId": response_id,
            "rawHeader": header,
            "rawPayload": payload,
            "rawResponse": raw,
            "negativeResponseCode": nrc_code,
            "negativeResponseMeaning": meaning,
        }

    # --- POSITIVE response (starts with 6X after possible header) ---
    # Positive UDS responses have the service byte echo with bit 0x40 set.
    # After the 3-char header, the first byte should be 0x6X.
    if header and payload and len(payload) >= 2:
        service_byte = payload[:2]
        if service_byte.startswith("6"):
            return {
                "status": "DISCOVERED",
                "responseType": "POSITIVE",
                "responseId": response_id,
                "rawHeader": header,
                "rawPayload": payload,
                "rawResponse": raw,
                "negativeResponseCode": None,
                "negativeResponseMeaning": None,
            }

    # --- Default: treat as DISCOVERED with whatever we can extract ---
    # This covers cases where the response is valid hex but doesn't match
    # the above patterns — we still record it as discovered with available data.
    if header:
        return {
            "status": "DISCOVERED",
            "responseType": "POSITIVE",
            "responseId": response_id,
            "rawHeader": header,
            "rawPayload": payload,
            "rawResponse": raw,
            "negativeResponseCode": None,
            "negativeResponseMeaning": None,
        }

    # Fallback: should not normally reach here
    return {
        "status": "UNKNOWN",
        "responseType": "MALFORMED",
        "responseId": None,
        "rawHeader": None,
        "rawPayload": None,
        "rawResponse": raw,
        "negativeResponseCode": None,
        "negativeResponseMeaning": None,
    }


def parse_multiline_response(raw_response: str, request_id: str) -> list:
    """Parse a multi-line ELM327 response into individual probe results.

    When a functional probe (e.g. ``7DF``) is sent, multiple ECUs may respond.
    The adapter returns each response on a separate line::

        7E8037F2211\\r\\n7EA037F2211\\r\\n7EC037F2211

    This function splits the response by lines and classifies each line
    independently, producing one probe result per responding ECU.

    Args:
        raw_response: The raw multi-line response string from the adapter.
        request_id: The CAN request ID that was sent.

    Returns:
        A list of probe result dicts, one per response line.
    """
    raw_response = _normalize_raw_response(raw_response)

    if not raw_response:
        return []

    # Split by common ELM327 line separators
    lines = raw_response.replace("\r", "\n").split("\n")
    lines = [line.strip() for line in lines if line.strip() and line.strip().upper() != "NO DATA"]

    if not lines:
        # Entire response was NO DATA or empty
        return [classify_response("NO DATA", request_id)]

    results = []
    for line in lines:
        result = classify_response(line, request_id)
        results.append(result)

    return results
