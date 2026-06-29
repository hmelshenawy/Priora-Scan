"""Standalone real-vehicle ELM327 WiFi diagnostic probe.

This tool connects directly to the WiFi ELM327 adapter configured in
``desktop-agent/.env``. It intentionally bypasses the PrioraScan backend,
agent pairing, scan queue, live-data poller, session workflow, and event
publishing so real-vehicle OBD vs UDS behavior can be isolated.

Safety: this tool sends read-only commands only.
"""

from __future__ import annotations

import logging
import sys
import time
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.config import OBD_WIFI_HOST, OBD_WIFI_PORT, OBD_WIFI_TIMEOUT_SECONDS
from src.obd.connection.wifi import WifiConnection


# ---------------------------------------------------------------------------
# Safety
# ---------------------------------------------------------------------------

FORBIDDEN_SERVICE_PREFIXES = ("27", "2E", "31", "11", "14", "85", "28")

DIAGNOSTIC_STATE_COMMANDS = [
    "ATZ",
    "ATI",
    "ATE0",
    "ATL0",
    "ATS0",
    "ATH1",
    "ATH0",
    "ATSP0",
    "ATDPN",
]

OBD_BASELINE_COMMANDS = [
    ("0902", "VIN"),
    ("0100", "Supported PIDs"),
    ("010C", "RPM"),
    ("010D", "Speed"),
    ("0105", "Coolant Temperature"),
    ("0142", "Control Module Voltage"),
    ("03", "Stored DTCs"),
    ("07", "Pending DTCs"),
    ("0A", "Permanent DTCs"),
]

POST_UDS_OBD_COMMANDS = [
    ("0100", "Supported PIDs"),
    ("010C", "RPM"),
    ("03", "Stored DTCs"),
]

ELM_INIT_SEQUENCE = ["ATZ", "ATE0", "ATL0", "ATS0", "ATH0", "ATSP0"]

UDS_PROBE = "22F190"
UDS_FUNCTIONAL_HEADER = "7DF"
UDS_PHYSICAL_HEADERS = ["7E0", "7E1", "7E2", "7E3", "7E4", "7E5", "7E6", "7E7"]


COMMAND_NAMES = {
    "ATZ": "Reset",
    "ATI": "Adapter ID",
    "ATE0": "Echo Off",
    "ATL0": "Linefeeds Off",
    "ATS0": "Spaces Off",
    "ATH1": "Headers On",
    "ATH0": "Headers Off",
    "ATSP0": "Auto Protocol",
    "ATDPN": "Current Protocol",
    "ATSH7DF": "Set Functional Header",
    "0902": "VIN",
    "0100": "Supported PIDs",
    "010C": "RPM",
    "010D": "Speed",
    "0105": "Coolant Temperature",
    "0142": "Control Module Voltage",
    "03": "Stored DTCs",
    "07": "Pending DTCs",
    "0A": "Permanent DTCs",
    UDS_PROBE: "UDS Read VIN DID F190",
}


@dataclass
class CommandResult:
    command: str
    raw: bytes
    elapsed: float
    error: str | None = None

    @property
    def decoded_text(self) -> str:
        return decode_text(self.raw)


def assert_safe_command(command: str) -> None:
    """Reject any write/security/programming-style UDS command."""
    upper = command.upper()
    if upper.startswith("AT"):
        return
    if upper in {"03", "07", "0A", "0902"}:
        return
    if upper.startswith("01"):
        return
    if upper == UDS_PROBE:
        return
    if upper.startswith(FORBIDDEN_SERVICE_PREFIXES):
        raise ValueError(f"Forbidden diagnostic command: {command}")
    raise ValueError(f"Command is outside this tool's read-only allowlist: {command}")


def section(title: str) -> None:
    print("\n================================================")
    print(title)
    print("================================================")


def decode_text(raw: bytes) -> str:
    return raw.decode("utf-8", errors="replace").replace("\r", "\\r").replace("\n", "\\n")


def display_result(result: CommandResult, label: str | None = None, include_classification: bool = False) -> None:
    suffix = f" ({label})" if label else ""
    print(f"\n>>> {result.command}{suffix}")
    if result.error:
        print(f"elapsed={result.elapsed:.3f}s")
        print(f"ERROR={result.error}")
        if include_classification:
            print("classification=CONNECT_ERROR")
        return

    print(f"elapsed={result.elapsed:.3f}s prompt_found={b'>' in result.raw}")
    print(f"raw={result.raw!r}")
    print(f"decoded={result.decoded_text}")

    decoded_value = decode_response(result.command, result.raw)
    if decoded_value is not None:
        print(f"value={decoded_value}")

    if include_classification:
        print(f"classification={classify_response(result.raw)}")


def send_command(conn: WifiConnection, command: str) -> CommandResult:
    assert_safe_command(command)
    started_at = time.monotonic()
    try:
        conn.write((command + "\r").encode("ascii"))
        response = conn.read()
        elapsed = time.monotonic() - started_at
        return CommandResult(command=command, raw=response, elapsed=elapsed)
    except Exception as exc:  # noqa: BLE001 - command-level tool output
        elapsed = time.monotonic() - started_at
        return CommandResult(command=command, raw=b"", elapsed=elapsed, error=f"{type(exc).__name__}: {exc}")


def _response_text(raw: bytes) -> str:
    return raw.decode("ascii", errors="ignore").upper()


def _response_hex(raw: bytes) -> str:
    text = _response_text(raw)
    for noise in (
        "SEARCHING...",
        "UNABLE TO CONNECT",
        "NO DATA",
        "STOPPED",
        "OK",
        "ERROR",
        "?",
    ):
        text = text.replace(noise, " ")
    text = text.replace(">", " ").replace("\r", " ").replace("\n", " ")
    return "".join(ch for ch in text if ch in "0123456789ABCDEF")


def _pid_payload(raw: bytes, command: str, expected_mode: str = "41") -> list[int] | None:
    hex_text = _response_hex(raw)
    prefix = expected_mode + command[2:]
    index = hex_text.find(prefix)
    if index < 0:
        return None
    data = hex_text[index + len(prefix):]
    if len(data) < 2:
        return []
    if len(data) % 2:
        data = data[:-1]
    return [int(data[i:i + 2], 16) for i in range(0, len(data), 2)]


def _decode_vin(raw: bytes) -> str | None:
    hex_text = _response_hex(raw)
    marker = "4902"
    index = hex_text.find(marker)
    if index < 0:
        return None
    data = hex_text[index + len(marker):]
    if len(data) % 2:
        data = data[:-1]
    try:
        text = bytes.fromhex(data).decode("ascii", errors="ignore")
    except ValueError:
        return None
    vin = "".join(ch for ch in text if ch.isalnum())
    return vin[-17:] if len(vin) >= 17 else vin or None


def decode_response(command: str, raw: bytes) -> str | None:
    text = _response_text(raw)
    if not raw:
        return None
    if "NO DATA" in text:
        return "NO DATA"
    if "UNABLE TO CONNECT" in text:
        return "UNABLE TO CONNECT"

    if command == "0902":
        return _decode_vin(raw)

    if command in {"03", "07", "0A"}:
        hex_text = _response_hex(raw)
        if hex_text:
            return hex_text
        return None

    data = _pid_payload(raw, command)
    if command == "0100":
        hex_text = _response_hex(raw)
        index = hex_text.find("4100")
        return hex_text[index:index + 12] if index >= 0 else None
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
        return f"{data[0] - 40} C"
    if command == "0142":
        if data is None or len(data) < 2:
            return None
        voltage = ((data[0] * 256) + data[1]) / 1000
        return f"{voltage:.3f} V"
    return None


def classify_response(raw: bytes) -> str:
    text = _response_text(raw).replace(" ", "")
    if "UNABLETOCONNECT" in text:
        return "CONNECT_ERROR"
    if "NODATA" in text:
        return "NO_DATA"
    if "62F190" in text:
        return "POSITIVE"
    if "7F" in text:
        return "NEGATIVE"
    if not _response_hex(raw):
        return "MALFORMED"
    return "UNKNOWN"


def protocol_value(result: CommandResult) -> str:
    text = _response_text(result.raw)
    text = text.replace(">", " ").replace("\r", " ").replace("\n", " ")
    tokens = [token.strip() for token in text.split() if token.strip()]
    return tokens[-1] if tokens else ""


def command_success(result: CommandResult) -> bool:
    if result.error:
        return False
    text = _response_text(result.raw)
    if "NO DATA" in text or "UNABLE TO CONNECT" in text or "?" in text:
        return False
    return bool(_response_hex(result.raw))


def uds_success(classification: str) -> bool:
    return classification in {"POSITIVE", "NEGATIVE"}


def status_text(result: CommandResult) -> str:
    return "SUCCESS" if command_success(result) else "FAILED"


def run_commands(conn: WifiConnection, commands: Iterable[str]) -> dict[str, CommandResult]:
    results: dict[str, CommandResult] = {}
    for command in commands:
        result = send_command(conn, command)
        results[command] = result
        display_result(result, COMMAND_NAMES.get(command, command))
    return results


def run_elm_init(conn: WifiConnection, *, headers_on: bool = False) -> dict[str, CommandResult]:
    commands = ["ATZ", "ATE0", "ATL0", "ATS0", "ATH1" if headers_on else "ATH0", "ATSP0"]
    return run_commands(conn, commands)


def read_protocol(conn: WifiConnection, label: str) -> tuple[CommandResult, str]:
    result = send_command(conn, "ATDPN")
    display_result(result, label)
    protocol = protocol_value(result)
    print(f"\nProtocol {label}:\n{protocol or 'UNKNOWN'}")
    return result, protocol


def run_diagnostic_state(conn: WifiConnection) -> dict[str, CommandResult]:
    section("DIAGNOSTIC STATE")
    results: dict[str, CommandResult] = {}
    for command in DIAGNOSTIC_STATE_COMMANDS:
        result = send_command(conn, command)
        results[command] = result
        display_result(result, COMMAND_NAMES.get(command))
    return results


def run_obd_baseline(conn: WifiConnection) -> dict[str, CommandResult]:
    section("OBD BASELINE")
    results: dict[str, CommandResult] = {}
    for command, label in OBD_BASELINE_COMMANDS:
        result = send_command(conn, command)
        results[command] = result
        display_result(result, label)
    return results


def run_uds_functional(conn: WifiConnection) -> tuple[list[CommandResult], str]:
    section("UDS FUNCTIONAL")
    header = send_command(conn, f"ATSH{UDS_FUNCTIONAL_HEADER}")
    display_result(header, COMMAND_NAMES.get(header.command))

    probe = send_command(conn, UDS_PROBE)
    classification = classify_response(probe.raw) if not probe.error else "CONNECT_ERROR"
    display_result(probe, COMMAND_NAMES.get(UDS_PROBE), include_classification=True)
    return [header, probe], classification


def run_uds_physical(conn: WifiConnection) -> tuple[list[CommandResult], int]:
    section("UDS PHYSICAL")
    results: list[CommandResult] = []
    responders = 0
    for header in UDS_PHYSICAL_HEADERS:
        header_result = send_command(conn, f"ATSH{header}")
        results.append(header_result)
        display_result(header_result, f"Set Header {header}")

        probe_result = send_command(conn, UDS_PROBE)
        results.append(probe_result)
        classification = classify_response(probe_result.raw) if not probe_result.error else "CONNECT_ERROR"
        display_result(probe_result, COMMAND_NAMES.get(UDS_PROBE), include_classification=True)
        if uds_success(classification):
            responders += 1
    return results, responders


def run_cleanup_and_post_uds_validation(conn: WifiConnection) -> tuple[dict[str, CommandResult], CommandResult]:
    section("POST-UDS OBD VALIDATION")
    for command in ("ATH0", "ATSH7DF"):
        result = send_command(conn, command)
        display_result(result, COMMAND_NAMES.get(command, command))

    protocol = send_command(conn, "ATDPN")
    display_result(protocol, COMMAND_NAMES.get("ATDPN"))

    results: dict[str, CommandResult] = {}
    for command, label in POST_UDS_OBD_COMMANDS:
        result = send_command(conn, command)
        results[command] = result
        display_result(result, label)
    return results, protocol


def run_atsh_impact_test(conn: WifiConnection) -> dict[str, object]:
    section("ATSH IMPACT TEST")
    run_elm_init(conn)

    _, protocol_before = read_protocol(conn, "before ATSH")

    print("\nBefore ATSH:")
    before = send_command(conn, "0100")
    display_result(before, "Supported PIDs")
    print(f"0100 -> {status_text(before)}")

    header_7df = send_command(conn, "ATSH7DF")
    display_result(header_7df, "Set Header 7DF")
    _, protocol_after_7df = read_protocol(conn, "after ATSH7DF")
    print("\nAfter ATSH7DF:")
    after_7df = send_command(conn, "0100")
    display_result(after_7df, "Supported PIDs")
    print(f"0100 -> {status_text(after_7df)}")

    header_7e0 = send_command(conn, "ATSH7E0")
    display_result(header_7e0, "Set Header 7E0")
    _, protocol_after_7e0 = read_protocol(conn, "after ATSH7E0")
    print("\nAfter ATSH7E0:")
    after_7e0 = send_command(conn, "0100")
    display_result(after_7e0, "Supported PIDs")
    print(f"0100 -> {status_text(after_7e0)}")

    header_7df_again = send_command(conn, "ATSH7DF")
    display_result(header_7df_again, "Set Header 7DF")
    print("\nAfter ATSH7DF again:")
    after_7df_again = send_command(conn, "0100")
    display_result(after_7df_again, "Supported PIDs")
    print(f"0100 -> {status_text(after_7df_again)}")

    return {
        "protocols": [protocol_before, protocol_after_7df, protocol_after_7e0],
        "baseline_success": command_success(before),
        "after_successes": [
            command_success(after_7df),
            command_success(after_7e0),
            command_success(after_7df_again),
        ],
    }


def run_uds_impact_test(conn: WifiConnection) -> dict[str, object]:
    section("UDS IMPACT TEST")
    run_elm_init(conn, headers_on=True)

    _, protocol_before_atsh = read_protocol(conn, "before ATSH")

    baseline = send_command(conn, "0100")
    display_result(baseline, "Supported PIDs before UDS")
    print(f"0100 before UDS -> {status_text(baseline)}")

    header = send_command(conn, "ATSH7DF")
    display_result(header, "Set Header 7DF")
    _, protocol_after_atsh = read_protocol(conn, "after ATSH")

    probe = send_command(conn, UDS_PROBE)
    display_result(probe, COMMAND_NAMES.get(UDS_PROBE), include_classification=True)
    _, protocol_after_uds = read_protocol(conn, "after UDS")

    post_results: dict[str, CommandResult] = {}
    for command, label in POST_UDS_OBD_COMMANDS:
        result = send_command(conn, command)
        post_results[command] = result
        display_result(result, f"{label} immediately after UDS")
        print(f"{command} after UDS -> {status_text(result)}")

    return {
        "protocols": [protocol_before_atsh, protocol_after_atsh, protocol_after_uds],
        "baseline_success": command_success(baseline),
        "classification": classify_response(probe.raw) if not probe.error else "CONNECT_ERROR",
        "post_successes": {command: command_success(result) for command, result in post_results.items()},
    }


def run_recovery_test(conn: WifiConnection) -> dict[str, object]:
    section("RECOVERY TEST")
    run_elm_init(conn)
    _, protocol_after_recovery = read_protocol(conn, "after recovery")

    results: dict[str, CommandResult] = {}
    for command, label in POST_UDS_OBD_COMMANDS:
        result = send_command(conn, command)
        results[command] = result
        display_result(result, f"{label} after full reset")
        print(f"{command} after recovery -> {status_text(result)}")

    return {
        "protocols": [protocol_after_recovery],
        "successes": {command: command_success(result) for command, result in results.items()},
    }


def protocols_changed(protocols: Iterable[str]) -> bool:
    values = [protocol for protocol in protocols if protocol]
    return len(set(values)) > 1


def print_root_cause_analysis(
    atsh_result: dict[str, object],
    uds_result: dict[str, object],
    recovery_result: dict[str, object],
) -> None:
    atsh_baseline = bool(atsh_result.get("baseline_success"))
    atsh_after_successes = list(atsh_result.get("after_successes") or [])
    atsh_breaks = atsh_baseline and any(success is False for success in atsh_after_successes)

    uds_baseline = bool(uds_result.get("baseline_success"))
    uds_post_successes = dict(uds_result.get("post_successes") or {})
    uds_breaks = uds_baseline and any(success is False for success in uds_post_successes.values())

    recovery_successes = dict(recovery_result.get("successes") or {})
    recovery_restores = all(recovery_successes.get(command) is True for command in ("0100", "010C", "03"))

    protocol_changed = protocols_changed(
        list(atsh_result.get("protocols") or [])
        + list(uds_result.get("protocols") or [])
        + list(recovery_result.get("protocols") or [])
    )

    if atsh_breaks:
        likely = "ATSH state corruption"
    elif uds_breaks and recovery_restores:
        likely = "ELM327 firmware limitation"
    elif uds_breaks and not recovery_restores:
        likely = "Mercedes gateway filtering"
    elif uds_result.get("classification") in {"NO_DATA", "NEGATIVE"} and not uds_breaks:
        likely = "UDS service unsupported"
    else:
        likely = "Unknown"

    section("ROOT CAUSE ANALYSIS")
    print(f"ATSH breaks OBD: {'YES' if atsh_breaks else 'NO'}")
    print(f"22F190 breaks OBD: {'YES' if uds_breaks else 'NO'}")
    print(f"Full reset restores OBD: {'YES' if recovery_restores else 'NO'}")
    print(f"Protocol changed: {'YES' if protocol_changed else 'NO'}")
    print(f"Most likely root cause: {likely}")


def print_summary(
    protocol_before: str,
    protocol_after: str,
    obd_baseline: dict[str, CommandResult],
    uds_functional_classification: str,
    uds_physical_responders: int,
    post_uds_obd: dict[str, CommandResult],
) -> None:
    section("SUMMARY")
    obd_vin = command_success(obd_baseline.get("0902", CommandResult("0902", b"", 0)))
    obd_rpm = command_success(obd_baseline.get("010C", CommandResult("010C", b"", 0)))
    obd_dtc = any(command_success(obd_baseline.get(cmd, CommandResult(cmd, b"", 0))) for cmd in ("03", "07", "0A"))
    obd_after = all(command_success(post_uds_obd.get(cmd, CommandResult(cmd, b"", 0))) for cmd in ("0100", "010C", "03"))

    print(f"Protocol before: {protocol_before or 'UNKNOWN'}")
    print(f"Protocol after: {protocol_after or 'UNKNOWN'}")
    print(f"OBD VIN: {'SUCCESS' if obd_vin else 'FAILED'}")
    print(f"OBD RPM: {'SUCCESS' if obd_rpm else 'FAILED'}")
    print(f"OBD DTC: {'SUCCESS' if obd_dtc else 'FAILED'}")
    print(f"UDS Functional: {'SUCCESS' if uds_success(uds_functional_classification) else 'FAILED'}")
    print(f"UDS Physical Responders: {uds_physical_responders}")
    print(f"OBD after UDS: {'SUCCESS' if obd_after else 'FAILED'}")


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

    print("Read-only probe. No security access, coding, programming, routine control, or adaptation commands are sent.")
    print(f"Connecting to {OBD_WIFI_HOST}:{OBD_WIFI_PORT} timeout={OBD_WIFI_TIMEOUT_SECONDS}s")
    try:
        conn.open()
    except Exception as exc:
        print(f"CONNECT FAILED: {exc}")
        return 1

    try:
        run_diagnostic_state(conn)

        obd_baseline = run_obd_baseline(conn)

        section("PROTOCOL VERIFICATION")
        protocol_before_result = send_command(conn, "ATDPN")
        display_result(protocol_before_result, "Protocol before UDS")
        protocol_before = protocol_value(protocol_before_result)
        print(f"\nProtocol before UDS:\n{protocol_before or 'UNKNOWN'}")

        _, uds_functional_classification = run_uds_functional(conn)
        _, uds_physical_responders = run_uds_physical(conn)

        protocol_after_result = send_command(conn, "ATDPN")
        protocol_after = protocol_value(protocol_after_result)
        print("\nProtocol after UDS:")
        display_result(protocol_after_result, "Protocol after UDS")
        print(f"\nProtocol after UDS:\n{protocol_after or 'UNKNOWN'}")
        if protocol_before and protocol_after and protocol_before != protocol_after:
            print("WARNING: Protocol changed during discovery")

        post_uds_obd, cleanup_protocol = run_cleanup_and_post_uds_validation(conn)
        protocol_after_cleanup = protocol_value(cleanup_protocol) or protocol_after
        if protocol_before and protocol_after_cleanup and protocol_before != protocol_after_cleanup:
            print("WARNING: Protocol changed after cleanup")

        atsh_result = run_atsh_impact_test(conn)
        uds_result = run_uds_impact_test(conn)
        recovery_result = run_recovery_test(conn)

        print_summary(
            protocol_before=protocol_before,
            protocol_after=protocol_after,
            obd_baseline=obd_baseline,
            uds_functional_classification=uds_functional_classification,
            uds_physical_responders=uds_physical_responders,
            post_uds_obd=post_uds_obd,
        )
        print_root_cause_analysis(atsh_result, uds_result, recovery_result)
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
