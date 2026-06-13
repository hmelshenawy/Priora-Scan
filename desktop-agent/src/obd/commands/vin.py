import logging

from src.obd.commands.elm_parser import clean_raw_response, parse_vin

logger = logging.getLogger(__name__)


def read_vin(adapter) -> str:
    """Read Vehicle Identification Number via Mode 09 PID 02.

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
    cleaned = clean_raw_response(raw)
    result = parse_vin(cleaned)

    if not result.get("supported", False):
        if "error" in result:
            raise RuntimeError(f"VIN read failed: {result['error']}")
        raise RuntimeError("VIN not supported by vehicle")

    vin = result["value"]
    if len(vin) != 17:
        raise RuntimeError(f"Invalid VIN length: {len(vin)} (expected 17)")

    return vin


def _read_vin_mock(raw: bytes) -> str:
    """Parse VIN from mock adapter response (simple hex decode)."""
    hex_str = raw.decode("utf-8", errors="ignore").replace(" ", "").replace("\r", "").replace("\n", "")
    if not hex_str.startswith("4902"):
        raise RuntimeError("Unexpected VIN response")
    data = hex_str[4:]
    vin = bytearray.fromhex(data).decode("ascii", errors="ignore")
    if len(vin) != 17:
        raise RuntimeError("Invalid VIN length")
    return vin
