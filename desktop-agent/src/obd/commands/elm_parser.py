"""ELM327 response parser — pure functions for each response type.

Handles real ELM327 quirks: prompts (>), SEARCHING..., NO DATA,
? (unsupported), multi-frame responses, whitespace, and \r\n.
"""

import logging

logger = logging.getLogger(__name__)


def _debug(message: str) -> None:
    print(f"[OBD_ELM_PARSER_DEBUG] {message}")


# ---------------------------------------------------------------------------
# Common result dicts
# ---------------------------------------------------------------------------

UNSUPPORTED = {"supported": False}
PARSE_ERROR = {"error": "unsupported command"}
INCOMPLETE_DATA = {"error": "incomplete data"}
ADAPTER_STOPPED = {"error": "adapter stopped"}


# ---------------------------------------------------------------------------
# clean_raw_response
# ---------------------------------------------------------------------------

ADAPTER_ERROR_MARKERS = ("NO DATA", "NODATA", "?", "ERROR", "STOPPED", "UNABLE")


def _response_lines(raw: bytes, command: str | None = None) -> list[str]:
    """Return cleaned ELM response lines with prompt and optional echo removed."""
    text = raw.decode("utf-8", errors="ignore")
    text = text.replace(">", "")
    text = text.replace("\r", "\n").replace("\t", " ")
    command_compact = (command or "").replace(" ", "").upper()

    lines: list[str] = []
    for line in text.split("\n"):
        normalized = " ".join(line.strip().upper().split())
        if not normalized or normalized == "SEARCHING...":
            continue
        compact = normalized.replace(" ", "")
        if command_compact and compact == command_compact:
            continue
        lines.append(normalized)
    return lines


def is_adapter_error_response(response: str) -> bool:
    compact = response.replace(" ", "").upper()
    spaced = response.upper()
    return any(marker in compact or marker in spaced for marker in ADAPTER_ERROR_MARKERS)


def compact_raw_response(raw: bytes, command: str | None = None) -> str:
    """Return an uppercase compact response string for command readers.

    Removes whitespace, CR/LF, prompts, and an optional command echo.
    Non-payload text is preserved as compact text so callers can reject
    NO DATA / ERROR markers before hex parsing.
    """
    return "".join(line.replace(" ", "") for line in _response_lines(raw, command=command))


def clean_raw_response(raw: bytes, command: str | None = None) -> str:
    """Strip ELM327 artefacts from raw bytes and return clean hex string.

    Removes: '>' prompt, '\\r', '\\n', 'SEARCHING...', leading/trailing
    whitespace. Returns uppercase hex string with spaces preserved (caller
    may strip spaces depending on context).
    """
    return " ".join(_response_lines(raw, command=command)).strip().upper()


# ---------------------------------------------------------------------------
# parse_vin
# ---------------------------------------------------------------------------

def parse_vin(response: str) -> dict:
    """Decode Mode 09 PID 02 multi-frame VIN response.

    After clean_raw_response, multi-line responses are collapsed to a
    single space-delimited line. We split on "49 02" frame markers
    to identify each frame.

    Returns: {"value": "1HGCMI...", "supported": True} or UNSUPPORTED.
    """
    if "NO DATA" in response:
        return UNSUPPORTED.copy()

    if response.strip() == "?":
        return PARSE_ERROR.copy()

    if "STOPPED" in response:
        return ADAPTER_STOPPED.copy()

    # Split the response into frames by finding "49 02" markers
    # Each frame starts with "49 02 <frame_num> ..."
    tokens = response.split()
    frames = []
    current_frame = []

    for token in tokens:
        if token == "49" and current_frame and current_frame[-1] != "49":
            # Start of a new frame -- flush the current one
            if current_frame:
                frames.append(current_frame)
            current_frame = ["49"]
        elif token == "49" and not current_frame:
            current_frame = ["49"]
        else:
            current_frame.append(token)

    if current_frame:
        frames.append(current_frame)

    # Collect hex bytes from each frame, skipping the header
    hex_bytes = []
    for frame in frames:
        # Frame format: 49 02 <frame#> [count for frame1] <data...>
        if len(frame) < 3:
            continue
        # Verify this is a Mode 09 PID 02 frame
        if frame[0] != "49" or (len(frame) > 1 and frame[1] != "02"):
            # Not a VIN frame -- treat as raw hex data
            hex_bytes.extend(frame)
            continue

        frame_num = frame[2] if len(frame) > 2 else "01"

        if frame_num == "01":
            # Frame 1: 49 02 01 <count> <5 data bytes>
            # Skip: 49, 02, 01, count -> data starts at index 4
            data_tokens = frame[4:]
        else:
            # Frame 2+: 49 02 <frame#> <7 data bytes>
            # Skip: 49, 02, frame# -> data starts at index 3
            data_tokens = frame[3:]

        hex_bytes.extend(data_tokens)

    if not hex_bytes:
        return INCOMPLETE_DATA.copy()

    try:
        vin_hex = "".join(hex_bytes)
        _debug(f"parse_vin fromhex_data={vin_hex!r} response={response!r}")
        vin = bytearray.fromhex(vin_hex).decode("ascii", errors="ignore")
    except (ValueError, UnicodeDecodeError):
        return INCOMPLETE_DATA.copy()

    # Strip null bytes (common in VIN padding)
    vin = vin.replace("\x00", "")

    if len(vin) != 17:
        logger.warning("VIN length %d (expected 17): %r", len(vin), vin)
        # Return what we have -- caller can decide
        return {"value": vin, "supported": True, "warning": f"VIN length {len(vin)} != 17"}

    return {"value": vin, "supported": True}


# ---------------------------------------------------------------------------
# parse_dtcs
# ---------------------------------------------------------------------------

def _normalize_hex_tokens(tokens: list[str]) -> str:
    """Normalize hex tokens to a continuous hex string.

    Handles both compact format ('410CFF1A') and space-delimited
    byte format ('41 0C FF 1A' or '41 0C FF 1A'). Each token is
    zero-padded to 2 chars if needed, then joined.
    """
    normalized = []
    for t in tokens:
        t = t.upper().strip()
        if not t:
            continue
        # Zero-pad single-char hex tokens (e.g., "A" → "0A")
        if len(t) == 1:
            t = "0" + t
        normalized.append(t)
    return "".join(normalized)


def parse_dtcs(response: str) -> dict:
    """Parse Mode 03 DTC response into list of DTC code strings.

    Returns: {"codes": ["P0133", "P0109", ...], "supported": True}
    or UNSUPPORTED / INCOMPLETE_DATA.
    """
    if "NO DATA" in response:
        # No DTCs is a valid result — return empty list
        return {"codes": [], "supported": True}

    if response.strip() == "?":
        return PARSE_ERROR.copy()

    if "STOPPED" in response:
        return ADAPTER_STOPPED.copy()

    # Collect all hex tokens, skipping the Mode 03 header "43"
    hex_tokens = []
    for token in response.split():
        token = token.strip()
        if not token or token == "43":
            continue
        try:
            int(token, 16)
            hex_tokens.append(token)
        except ValueError:
            continue

    if not hex_tokens:
        return {"codes": [], "supported": True}

    # Normalize tokens to a continuous hex string
    hex_str = _normalize_hex_tokens(hex_tokens)

    if len(hex_str) < 4:
        # 0000 means no codes
        if hex_str == "0000" or not hex_str:
            return {"codes": [], "supported": True}
        return INCOMPLETE_DATA.copy()

    # DTC codes: 2 bytes (4 hex chars) each
    # First nibble: 0=P, 1=C, 2=B, 3=U
    # Then: 2nd nibble = 1st digit, 3rd nibble = 2nd digit, 4th nibble = 3rd digit
    dtc_codes = []
    for i in range(0, len(hex_str) - 3, 4):
        code_hex = hex_str[i:i + 4]
        if len(code_hex) < 4:
            break
        try:
            first_byte = int(code_hex[:2], 16)
            second_byte = int(code_hex[2:4], 16)
        except ValueError:
            continue

        # Skip zero codes (padding)
        if first_byte == 0 and second_byte == 0:
            continue

        prefix_map = {0: "P", 1: "C", 2: "B", 3: "U"}
        prefix = prefix_map.get((first_byte >> 6) & 0x03, "P")
        digit1 = str((first_byte >> 4) & 0x03)
        digit2 = str(first_byte & 0x0F)
        digit3 = str(second_byte >> 4)
        digit4 = str(second_byte & 0x0F)

        dtc_codes.append(f"{prefix}{digit1}{digit2}{digit3}{digit4}")

    return {"codes": dtc_codes, "supported": True}


# ---------------------------------------------------------------------------
# parse_clear_result
# ---------------------------------------------------------------------------

def parse_clear_result(response: str) -> dict:
    """Parse Mode 04 clear DTC response.

    44 = success, 7F = failure with reason.

    Returns: {"success": True} or {"success": False, "reason": "..."}
    """
    if "NO DATA" in response:
        return {"success": False, "reason": "NO DATA from ECU"}

    if response.strip() == "?":
        return {"success": False, "reason": "unsupported command"}

    if "STOPPED" in response:
        return ADAPTER_STOPPED.copy()

    cleaned = response.strip()

    if "44" in cleaned.split():
        return {"success": True}

    # Check for 7F failure
    if "7F" in cleaned:
        # Format: 7F 04 31 (7F, mode, response code)
        parts = cleaned.split()
        reason_parts = [p for p in parts if p != "7F"]
        reason_str = " ".join(reason_parts)
        return {"success": False, "reason": f"ECU rejected (7F {reason_str})"}

    return {"success": False, "reason": f"unexpected response: {cleaned}"}


# ---------------------------------------------------------------------------
# parse_pid_bytes
# ---------------------------------------------------------------------------

def parse_pid_bytes(response: str) -> dict:
    """Extract raw PID hex data as bytes.

    Input: cleaned response like '41 0C FF 1A' or '410CFF1A'
    Returns: {"value": b"\\x0C\\xFF\\x1A", "supported": True} or UNSUPPORTED.
    """
    if "NO DATA" in response:
        return UNSUPPORTED.copy()

    if response.strip() == "?":
        return PARSE_ERROR.copy()

    if "STOPPED" in response:
        return ADAPTER_STOPPED.copy()

    # Check if the response is compact hex (no spaces) like '410CFF1A'
    # vs space-delimited like '41 0C FF 1A'
    stripped = response.strip()
    parts = stripped.split()

    if len(parts) == 1 and len(parts[0]) > 2:
        # Compact hex format: extract header (4 chars = mode+pid) then data
        compact = parts[0]
        # Validate it starts with a mode response byte (41, 49, etc.)
        try:
            int(compact, 16)
        except ValueError:
            return INCOMPLETE_DATA.copy()

        if len(compact) < 4:
            return INCOMPLETE_DATA.copy()

        # First 2 chars = mode response, next 2 chars = PID, rest = data
        data_hex = compact[4:]
        if not data_hex:
            return INCOMPLETE_DATA.copy()

        try:
            _debug(f"parse_pid_bytes compact fromhex_data={data_hex!r} response={response!r}")
            raw_bytes = bytes.fromhex(data_hex)
        except ValueError:
            _debug(f"parse_pid_bytes compact fromhex failed data={data_hex!r} response={response!r}")
            return INCOMPLETE_DATA.copy()

        return {"value": raw_bytes, "supported": True}

    # Space-delimited format: '41 0C FF 1A'
    hex_parts = []
    for p in parts:
        try:
            int(p, 16)
            hex_parts.append(p)
        except ValueError:
            continue

    if len(hex_parts) < 2:
        # Need at least Mode + PID byte
        return INCOMPLETE_DATA.copy()

    # First byte should be 41 (Mode 01 response), second is PID
    # Skip these two header bytes
    data_hex = _normalize_hex_tokens(hex_parts[2:])

    if not data_hex:
        return INCOMPLETE_DATA.copy()

    try:
        _debug(f"parse_pid_bytes spaced fromhex_data={data_hex!r} response={response!r}")
        raw_bytes = bytes.fromhex(data_hex)
    except ValueError:
        _debug(f"parse_pid_bytes spaced fromhex failed data={data_hex!r} response={response!r}")
        return INCOMPLETE_DATA.copy()

    return {"value": raw_bytes, "supported": True}


# ---------------------------------------------------------------------------
# parse_supported_pids
# ---------------------------------------------------------------------------

def parse_supported_pids(response: str) -> dict:
    """Parse PID bitmask into list of supported hex PID identifiers.

    Input: cleaned response like '41 00 BE 1F B8 20' (4 bytes bitmask)
    Returns: {"pids": ["01", "03", ...], "supported": True} or UNSUPPORTED.
    """
    if "NO DATA" in response:
        return UNSUPPORTED.copy()

    if response.strip() == "?":
        return PARSE_ERROR.copy()

    if "STOPPED" in response:
        return ADAPTER_STOPPED.copy()

    parts = response.split()
    hex_parts = []
    for p in parts:
        try:
            int(p, 16)
            hex_parts.append(p)
        except ValueError:
            continue

    if len(hex_parts) < 3:
        # Need Mode (41) + PID (00-20-40...) + at least 1 bitmask byte
        # Try compact hex format
        stripped = response.strip()
        if len(stripped) > 6 and " " not in stripped:
            try:
                int(stripped, 16)
                # Compact format: first 2 chars = mode, next 2 = PID
                pid_byte = int(stripped[2:4], 16)
                bitmask_hex = stripped[4:]
                if not bitmask_hex:
                    return INCOMPLETE_DATA.copy()
                base_offset = pid_byte
                try:
                    bitmask_int = int(bitmask_hex, 16)
                except ValueError:
                    return INCOMPLETE_DATA.copy()
                supported = []
                num_bits = len(bitmask_hex) * 4
                for bit in range(num_bits):
                    if bitmask_int & (1 << (num_bits - 1 - bit)):
                        pid_num = base_offset + bit + 1
                        supported.append(f"{pid_num:02X}")
                return {"pids": supported, "supported": True}
            except ValueError:
                pass
        return INCOMPLETE_DATA.copy()

    # Extract bitmask bytes (everything after Mode + PID header)
    bitmask_hex = _normalize_hex_tokens(hex_parts[2:])
    if not bitmask_hex:
        return INCOMPLETE_DATA.copy()

    try:
        bitmask_int = int(bitmask_hex, 16)
    except ValueError:
        return INCOMPLETE_DATA.copy()

    # Determine the base PID offset from the PID byte in the response
    pid_byte = int(hex_parts[1], 16)
    base_offset = pid_byte  # 00 → PIDs 01-20, 20 → 21-40, etc.

    supported = []
    num_bits = len(bitmask_hex) * 4  # each hex char = 4 bits
    for bit in range(num_bits):
        if bitmask_int & (1 << (num_bits - 1 - bit)):
            pid_num = base_offset + bit + 1
            supported.append(f"{pid_num:02X}")

    return {"pids": supported, "supported": True}
