"""VIN reader — Mode 09 PID 02 Vehicle Identification Number.

Returns a VinResult typed result instead of raising on unsupported VIN.
Only genuine transport/adapter failures raise RuntimeError.

Usage::

    from src.obd.commands.vin import read_vin, VinResult

    result = read_vin(adapter)
    if result.status == VIN_SUPPORTED:
        print(f"VIN: {result.vin}")
    else:
        print(f"VIN unsupported: {result.reason}")
"""

import logging
from dataclasses import dataclass

from src.obd.commands.elm_parser import clean_raw_response, parse_vin

logger = logging.getLogger(__name__)


def _debug(message: str) -> None:
    print(f"[OBD_VIN_DEBUG] {message}")

# ---------------------------------------------------------------------------
# VinResult — typed result for VIN read attempts
# ---------------------------------------------------------------------------

# Status constants
VIN_SUPPORTED = "SUPPORTED"
VIN_UNSUPPORTED = "UNSUPPORTED"

# Unsupported reason constants
VIN_UNSUPPORTED_ALL_FF = "ALL_FF"
VIN_UNSUPPORTED_NO_DATA = "NO_DATA"
VIN_UNSUPPORTED_MALFORMED = "MALFORMED"
VIN_UNSUPPORTED_EMPTY = "EMPTY_RESPONSE"


@dataclass(frozen=True)
class VinResult:
    """Typed result representing the outcome of a VIN read attempt.

    Attributes:
        status: ``VIN_SUPPORTED`` or ``VIN_UNSUPPORTED``.
        vin: Decoded 17-character VIN string when supported, ``None`` when unsupported.
        reason: Unsupported reason when status is ``VIN_UNSUPPORTED``.
            One of ``VIN_UNSUPPORTED_ALL_FF``, ``VIN_UNSUPPORTED_NO_DATA``,
            ``VIN_UNSUPPORTED_MALFORMED``, or ``VIN_UNSUPPORTED_EMPTY``.
            ``None`` when status is ``VIN_SUPPORTED``.
    """

    status: str
    vin: str | None
    reason: str | None = None

    @classmethod
    def supported(cls, vin: str) -> "VinResult":
        """Create a SUPPORTED result with the decoded VIN string."""
        return cls(status=VIN_SUPPORTED, vin=vin, reason=None)

    @classmethod
    def unsupported(cls, reason: str) -> "VinResult":
        """Create an UNSUPPORTED result with the given reason."""
        return cls(status=VIN_UNSUPPORTED, vin=None, reason=reason)


# ---------------------------------------------------------------------------
# read_vin — main entry point
# ---------------------------------------------------------------------------


def read_vin(adapter) -> VinResult:
    """Read Vehicle Identification Number via Mode 09 PID 02.

    Returns a VinResult instead of raising on unsupported VIN.
    Only genuine transport/adapter failures raise RuntimeError.

    For explicitly declared real adapters (USB/WiFi ELM327), uses elm_parser
    for robust response handling including NO DATA, SEARCHING, and multi-frame.
    For mock and legacy adapters without adapter_type, uses existing simple
    hex decode.
    """
    raw = adapter.send("0902")
    adapter_type = getattr(adapter, "adapter_type", None)

    if adapter_type is None or adapter_type == "MOCK":
        # Mock and legacy test adapters return clean hex — use simple decode.
        return _read_vin_mock(raw)

    # Real adapter — use ELM327 parser
    cleaned = clean_raw_response(raw, command="0902")
    result = parse_vin(cleaned)

    # ADAPTER_STOPPED is a genuine transport failure — still raise
    if result.get("error") == "adapter stopped":
        raise RuntimeError("VIN read failed: adapter stopped")

    if not result.get("supported", False):
        # NO DATA or unsupported command — VIN not available
        if "error" in result:
            return VinResult.unsupported(VIN_UNSUPPORTED_NO_DATA)
        return VinResult.unsupported(VIN_UNSUPPORTED_NO_DATA)

    vin = result["value"]

    # parse_vin may return a warning for non-17-char VINs
    # Both short and long VINs are malformed
    if len(vin) != 17:
        return VinResult.unsupported(VIN_UNSUPPORTED_MALFORMED)

    return VinResult.supported(vin)


def _read_vin_mock(raw: bytes) -> VinResult:
    """Parse VIN from mock adapter response (ASCII hex string decode).

    The mock adapter converts raw profile bytes to ASCII hex before
    returning, so raw is an ASCII-encoded hex string like b"4902...".

    Returns VinResult — never raises for unsupported/malformed VIN.
    Only genuine adapter failures would raise (not applicable for mock).

    Detection order:
    1. Empty response (b"") → EMPTY_RESPONSE
    2. Missing 4902 prefix → MALFORMED
    3. All-0xFF data payload → ALL_FF
    4. Non-printable ASCII characters → MALFORMED
    5. VIN length ≠ 17 → MALFORMED
    6. Valid 17-char printable ASCII VIN → SUPPORTED
    """
    # 1. Empty response — adapter returned nothing for VIN command
    if not raw:
        return VinResult.unsupported(VIN_UNSUPPORTED_EMPTY)

    hex_str = raw.decode("ascii", errors="ignore").strip()

    # 2. Missing 4902 prefix — unexpected VIN response format
    if not hex_str.startswith("4902"):
        return VinResult.unsupported(VIN_UNSUPPORTED_MALFORMED)

    data = hex_str[4:]
    _debug(f"mock fromhex_data={data!r} raw={raw!r}")
    try:
        vin_bytes = bytearray.fromhex(data)
    except ValueError as exc:
        _debug(f"mock fromhex failed data={data!r} raw={raw!r} error={exc}")
        return VinResult.unsupported(VIN_UNSUPPORTED_MALFORMED)

    # 3. All-0xFF payload — vehicle does not support VIN reporting
    if all(b == 0xFF for b in vin_bytes):
        return VinResult.unsupported(VIN_UNSUPPORTED_ALL_FF)

    vin = vin_bytes.decode("ascii", errors="ignore")

    # 4. Non-printable ASCII characters in decoded VIN
    if any(ord(c) < 0x20 or ord(c) > 0x7E for c in vin):
        return VinResult.unsupported(VIN_UNSUPPORTED_MALFORMED)

    # 5. VIN length must be exactly 17 characters
    if len(vin) != 17:
        return VinResult.unsupported(VIN_UNSUPPORTED_MALFORMED)

    # 6. Valid VIN
    return VinResult.supported(vin)
