"""Standalone ELM327 WiFi probe.

Connects directly to the adapter configured in desktop-agent/.env and sends a
small command set without using the PrioraScan backend, pairing, or UI.
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.config import OBD_WIFI_HOST, OBD_WIFI_PORT, OBD_WIFI_TIMEOUT_SECONDS
from src.obd.connection.wifi import WifiConnection


COMMANDS = [
    "ATZ",
    "ATI",
    "ATE0",
    "ATL0",
    "ATS0",
    "ATH0",
    "ATSP0",
    "0100",
    "010C",
    "010D",
    "0105",
    "0104",
    "0142",
    "012F",
    "0902",
    "09A6",
    "0101",
    "ATH1",
"ATSP6",
"ATSH7E0",
"22F190",
"ATSH7E2",
"22F190",
  "ATSH7DF",
    "22F190",
    "ATSH7E1",
    "22F190",
    "ATSH7E3",
    "22F190",
    "ATSH7E4",
    "22F190",
    "ATSH7E0",
    "22F187",
    "22F188",
    "22F18A",
]

COMMAND_NAMES = {
    "ATZ": "Reset",
    "ATI": "Adapter ID",
    "ATE0": "Echo Off",
    "ATL0": "Linefeeds Off",
    "ATS0": "Spaces Off",
    "ATH0": "Headers Off",
    "ATSP0": "Auto Protocol",
    "0100": "Supported PIDs 01-20",
    "010C": "Engine RPM",
    "010D": "Vehicle Speed",
    "0105": "Coolant Temperature",
    "0104": "Engine Load",
    "0142": "Control Module Voltage",
    "012F": "Fuel Level",
    "0902": "VIN",
    "09A6": "Vehicle Mileage",
    "0101": "REadiness Monitorss",
    "ATH1": "Headers On",
"ATSP6": "ISO 15765-4 CAN 11/500",
"ATSH7E0": "UDS Header ECM 7E0",
"22F190": "UDS Read VIN DID F190",
"ATSH7E2": "UDS Header TCM/Other 7E2",
    "ATSH7DF": "UDS Functional Address",
    "ATSH7E1": "UDS Header ECU 7E1",
    "ATSH7E3": "UDS Header ECU 7E3",
    "ATSH7E4": "UDS Header ECU 7E4",
    "22F187": "UDS Spare Part Number",
    "22F188": "UDS ECU Software Number",
    "22F18A": "UDS ECU Hardware Number",
}


def _response_hex(raw: bytes) -> str:
    text = raw.decode("ascii", errors="ignore").upper()
    for noise in ("SEARCHING...", "NO DATA", "STOPPED", "OK", "ERROR", "?"):
        text = text.replace(noise, " ")
    text = text.replace(">", " ").replace("\r", " ").replace("\n", " ")
    return "".join(ch for ch in text if ch in "0123456789ABCDEF")


def _pid_payload(raw: bytes, pid: str, expected_mode: str = "41") -> list[int] | None:
    hex_text = _response_hex(raw)
    prefix = expected_mode + pid[2:]
    index = hex_text.find(prefix)
    if index < 0:
        return None
    data = hex_text[index + len(prefix):]
    if len(data) < 2:
        return []
    if len(data) % 2:
        data = data[:-1]
    return [int(data[i:i + 2], 16) for i in range(0, len(data), 2)]


def decode_response(command: str, raw: bytes) -> str | None:
    text = raw.decode("ascii", errors="ignore").upper()
    if "NO DATA" in text:
        return "NO DATA"

    data = _pid_payload(raw, command)
    if command == "010C":
        if data is None or len(data) < 2:
            return None
        rpm = ((data[0] * 256) + data[1]) / 4
        return f"{rpm:.0f} rpm"
    if command == "010D":
        if data is None or len(data) < 1:
            return None
        return f"{data[0]} km/h"
    if command == "0105":
        if data is None or len(data) < 1:
            return None
        return f"{data[0] - 40} °C"
    if command == "0104":
        if data is None or len(data) < 1:
            return None
        return f"{data[0] * 100 / 255:.1f} %"
    if command == "0142":
        if data is None or len(data) < 2:
            return None
        voltage = ((data[0] * 256) + data[1]) / 1000
        return f"{voltage:.3f} V"
    if command == "012F":
        if data is None or len(data) < 1:
            return None
        return f"{data[0] * 100 / 255:.1f} %"
    return None


def main() -> int:
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    conn = WifiConnection(
        host=OBD_WIFI_HOST,
        port=OBD_WIFI_PORT,
        timeout=OBD_WIFI_TIMEOUT_SECONDS,
    )

    print(f"Connecting to {OBD_WIFI_HOST}:{OBD_WIFI_PORT} timeout={OBD_WIFI_TIMEOUT_SECONDS}s")
    try:
        conn.open()
    except Exception as exc:
        print(f"CONNECT FAILED: {exc}")
        return 1

    try:
        for command in COMMANDS:
            print(f"\n>>> {command} ({COMMAND_NAMES.get(command, 'Command')})")
            started_at = time.monotonic()
            try:
                conn.write((command + "\r").encode("ascii"))
                response = conn.read()
                elapsed = time.monotonic() - started_at
                print(f"elapsed={elapsed:.3f}s prompt_found={b'>' in response}")
                print(f"raw={response!r}")
                decoded = decode_response(command, response)
                if decoded is not None:
                    print(f"decoded={decoded}")
                try:
                    print(response.decode("utf-8", errors="replace"))
                except Exception:
                    pass
            except Exception as exc:
                elapsed = time.monotonic() - started_at
                print(f"ERROR elapsed={elapsed:.3f}s {type(exc).__name__}: {exc}")
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
