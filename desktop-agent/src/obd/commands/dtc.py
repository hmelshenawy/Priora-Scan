from typing import List
from src.obd.elm327 import Elm327Adapter
from src.models.fault_code import FaultCode


_DTC_LETTERS = {"0": "P", "1": "P", "2": "B", "3": "B", "4": "C", "5": "C", "6": "U", "7": "U"}


def _decode_dtc(raw_bytes: bytes) -> str:
    if len(raw_bytes) < 2:
        return None
    high, low = raw_bytes[0], raw_bytes[1]
    prefix = _DTC_LETTERS.get(str(high >> 6), "P")
    code = f"{prefix}{(high >> 4) & 0x03:01X}{(high & 0x0F):01X}{low:02X}"
    return code


def _parse_mode_response(raw: bytes, mode: str) -> List[bytes]:
    hex_str = raw.decode("utf-8", errors="ignore").replace(" ", "").replace("\r", "").replace("\n", "")
    if not hex_str.startswith(mode):
        return []
    data = hex_str[len(mode):]
    byte_arr = bytearray.fromhex(data)
    count = byte_arr[0] if len(byte_arr) > 0 else 0
    return [byte_arr[i : i + 2] for i in range(1, len(byte_arr), 2)][:count]


def read_fault_codes(adapter: Elm327Adapter) -> List[FaultCode]:
    faults: List[FaultCode] = []

    for mode, is_permanent in [("03", False), ("07", False), ("0A", True)]:
        raw = adapter.send(mode)
        entries = _parse_mode_response(raw, mode)
        for entry in entries:
            code = _decode_dtc(entry)
            if code:
                faults.append(FaultCode(code=code, permanent=is_permanent))
    return faults
