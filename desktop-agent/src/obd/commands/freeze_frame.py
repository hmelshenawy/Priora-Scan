"""Freeze frame data parsing and reading (OBD-II Mode 02 PID 01).

SAE J1979 freeze frame response format:
  42 01 [DTC_byte_1] [DTC_byte_2] [PID_num] [PID_value_bytes...] ...

MVP PID decoding (byte counts per SAE J1979):
  PID 04 (Engine Load):        1 byte, value * 100 / 255
  PID 05 (Coolant Temperature): 1 byte, value - 40
  PID 0C (RPM):                2 bytes, (A * 256 + B) / 4
  PID 0D (Vehicle Speed):      1 byte, value (km/h)

Unknown PIDs are preserved in additionalPids as raw hex — the parser does
NOT attempt generic variable-length PID decoding and does NOT infer PID
lengths for unknown PIDs.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from src.obd.commands.elm_parser import _decode_dtc_byte_pair
from src.obd.adapter import BaseAdapter
from src.obd.commands.health_pids import _send_pid


# MVP PID byte counts (SAE J1979)
_MVP_PID_BYTE_COUNTS: Dict[int, int] = {
    0x04: 1,  # Engine Load: value * 100 / 255
    0x05: 1,  # Coolant Temperature: value - 40
    0x0C: 2,  # RPM: (A * 256 + B) / 4
    0x0D: 1,  # Vehicle Speed: value km/h
}


def parse_freeze_frame(hex_str: str) -> Optional[Dict[str, Any]]:
    """Parse SAE J1979 Mode 02 PID 01 freeze frame response.

    Args:
        hex_str: Compact hex response string (after compact_raw_response).

    Returns:
        Dict with dtc, rpm, speed, coolantTemperature, engineLoad,
        additionalPids, rawResponse; or None on parse failure.
    """
    if hex_str is None or not hex_str:
        return None

    # Normalize: strip spaces and convert to uppercase
    compact = hex_str.replace(" ", "").upper()

    # Check for adapter error markers
    if "NODATA" in compact or compact.strip() == "?" or "STOPPED" in compact:
        return None

    # Validate prefix (Mode 02 response, PID 01)
    prefix = "4201"
    if not compact.startswith(prefix):
        return None

    # Parse remaining hex bytes after prefix
    try:
        data = bytes.fromhex(compact[len(prefix):])
    except ValueError:
        return None

    # Need at least 2 bytes for DTC
    if len(data) < 2:
        return None

    # Decode DTC using shared helper
    dtc = _decode_dtc_byte_pair(data[0], data[1])

    # Parse PID value pairs after DTC bytes
    rpm = None
    speed = None
    coolant_temperature = None
    engine_load = None
    additional_pids: Dict[str, str] = {}

    pos = 2  # Start after DTC bytes
    while pos < len(data):
        pid_num = data[pos]
        pos += 1

        if pid_num in _MVP_PID_BYTE_COUNTS:
            byte_count = _MVP_PID_BYTE_COUNTS[pid_num]
            if pos + byte_count > len(data):
                # Not enough bytes for this PID value — stop parsing
                break
            value_bytes = data[pos:pos + byte_count]
            pos += byte_count

            if pid_num == 0x04:  # Engine Load
                engine_load = round(value_bytes[0] * 100 / 255, 2)
            elif pid_num == 0x05:  # Coolant Temperature
                coolant_temperature = value_bytes[0] - 40
            elif pid_num == 0x0C:  # RPM
                rpm = (value_bytes[0] * 256 + value_bytes[1]) / 4
            elif pid_num == 0x0D:  # Vehicle Speed
                speed = value_bytes[0]
        else:
            # Unknown PID — scan remaining bytes for next known PID marker.
            # The parser cannot determine the byte count for unknown PIDs,
            # so it searches forward for a known PID number to resume parsing.
            # All bytes between the unknown PID and the next known PID are
            # attributed to the unknown PID as raw hex in additionalPids.
            found_next_known = False
            for scan_pos in range(pos, len(data)):
                if data[scan_pos] in _MVP_PID_BYTE_COUNTS:
                    known_byte_count = _MVP_PID_BYTE_COUNTS[data[scan_pos]]
                    # Verify enough bytes remain for the known PID's value
                    if scan_pos + 1 + known_byte_count <= len(data):
                        # Bytes from current pos to scan_pos belong to unknown PID
                        unknown_value = data[pos:scan_pos]
                        additional_pids[f"{pid_num:02X}"] = (
                            unknown_value.hex().upper()
                        )
                        pos = scan_pos
                        found_next_known = True
                        break

            if not found_next_known:
                # No more known PIDs — store remaining bytes as unknown PID value
                unknown_value = data[pos:]
                if unknown_value:
                    additional_pids[f"{pid_num:02X}"] = (
                        unknown_value.hex().upper()
                    )
                break

    return {
        "dtc": dtc,
        "rpm": rpm,
        "speed": speed,
        "coolantTemperature": coolant_temperature,
        "engineLoad": engine_load,
        "additionalPids": additional_pids,
        "rawResponse": hex_str,
    }


def read_freeze_frame(adapter: BaseAdapter) -> Dict[str, Any]:
    """Read freeze frame data from the vehicle via Mode 02 PID 01.

    Args:
        adapter: OBD adapter instance for sending commands.

    Returns:
        Dict with supported, available, and value keys following the
        three-state model:
        - {supported: True, available: True, value: {...}} when data exists
        - {supported: True, available: False, value: {}} when supported but
          no freeze frame is stored (DTC P0000 with no PID data)
        - {supported: False, available: False, value: {}} when unsupported
          or when the adapter returns no data
    """
    hex_str = _send_pid(adapter, "02", "01")
    if hex_str is None:
        return {"supported": False, "available": False, "value": {}}

    result = parse_freeze_frame(hex_str)
    if result is None:
        return {"supported": False, "available": False, "value": {}}

    # DTC P0000 with no PID data indicates "supported but no freeze frame stored".
    # This mapping follows current research assumptions (research.md R8) and may
    # be refined after real Toyota 0201 validation. Do not encode ECU-specific
    # assumptions into the parser — the parser remains generic and research-driven.
    if result["dtc"] == "P0000" and result["rpm"] is None and result["speed"] is None:
        return {"supported": True, "available": False, "value": {}}

    return {"supported": True, "available": True, "value": result}