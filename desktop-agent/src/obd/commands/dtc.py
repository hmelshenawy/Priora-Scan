from typing import List
from src.obd.elm327 import Elm327Adapter
from src.models.fault_code import FaultCode
from src.obd.commands.elm_parser import compact_raw_response, is_adapter_error_response


_DTC_LETTERS = {"0": "P", "1": "B", "2": "C", "3": "U"}
def _debug(message: str) -> None:
    print(f"[OBD_DTC_DEBUG] {message}")


def _decode_dtc(raw_bytes: bytes) -> str:
    if len(raw_bytes) < 2:
        return None
    high, low = raw_bytes[0], raw_bytes[1]
    prefix = _DTC_LETTERS.get(str(high >> 6), "P")
    code = f"{prefix}{(high >> 4) & 0x03:01X}{(high & 0x0F):01X}{low:02X}"
    return code


def _parse_mode_response(raw: bytes, mode: str, command: str | None = None) -> List[bytes]:
    hex_str = compact_raw_response(raw, command=command)
    _debug(f"parse mode={mode} raw={raw!r} cleaned={hex_str!r}")
    if not hex_str or is_adapter_error_response(hex_str):
        _debug(f"reject mode={mode} reason=empty_or_error cleaned={hex_str!r}")
        return []
    if not hex_str.startswith(mode):
        _debug(f"reject mode={mode} reason=wrong_prefix cleaned={hex_str!r}")
        return []
    if any(ch not in "0123456789ABCDEFabcdef" for ch in hex_str):
        _debug(f"reject mode={mode} reason=non_hex cleaned={hex_str!r}")
        return []
    data = hex_str[len(mode):]
    _debug(f"fromhex mode={mode} data={data!r} raw={raw!r}")
    try:
        byte_arr = bytearray.fromhex(data)
    except ValueError as exc:
        _debug(f"fromhex failed mode={mode} data={data!r} raw={raw!r} error={exc}")
        return []
    count = byte_arr[0] if len(byte_arr) > 0 else 0
    return [byte_arr[i : i + 2] for i in range(1, len(byte_arr), 2)][:count]


def read_fault_codes(adapter: Elm327Adapter) -> List[FaultCode]:
    faults: List[FaultCode] = []
    metadata = getattr(adapter, "fault_metadata", {})

    for mode, is_permanent, status in [
        ("03", False, "ACTIVE"),
        ("07", False, "PENDING"),
        ("0A", True, "PERMANENT"),
    ]:
        raw = adapter.send(mode)
        _debug(f"command={mode} raw={raw!r}")
        # ELM327 response prefix = mode + 0x40 (e.g., 03 -> 43, 07 -> 47, 0A -> 4A)
        response_prefix = f"{int(mode, 16) + 0x40:02X}"
        entries = _parse_mode_response(raw, response_prefix, command=mode)
        for entry in entries:
            code = _decode_dtc(entry)
            if code:
                code_metadata = metadata.get(code, {})
                faults.append(
                    FaultCode(
                        code=code,
                        permanent=is_permanent,
                        status=code_metadata.get("status", status),
                        ecu=code_metadata.get("ecu"),
                    )
                )
    return faults
