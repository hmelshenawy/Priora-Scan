"""Extended PID validation orchestration and report generation.

Validates which extended OBD-II Mode 01 PIDs are actually supported on a
connected vehicle, reads supported PIDs, and produces a structured result
with a formatted console report and support matrix.

Key principle: This is a VALIDATION feature. Do NOT normalize or hide
discrepancies. Preserve actual reader results and surface failure reasons.

Discovery failure raises RuntimeError (not a custom exception) — consistent
with the agent's convention for infrastructure failures.
"""

from __future__ import annotations

from typing import Any, Dict

from src.obd.adapter import BaseAdapter
from src.obd.commands.extended_pids import (
    CONFIGURED_EXTENDED_PIDS,
    EXTENDED_PID_NAMES,
    EXTENDED_PID_UNITS,
)
from src.obd.commands.health_pids import (
    _unavailable_pid_result,
    _unsupported_pid_result,
)
from src.obd.commands.supported_pids import read_supported_pids


def read_extended_pid_validation(adapter: BaseAdapter) -> Dict[str, Any]:
    """Validate extended PIDs on a connected vehicle.

    Discovers supported PIDs via Mode 01 bitmap, reads each supported PID,
    and returns structured results with failure reasons exposed.

    Returns:
        dict with keys:
          - "pids": dict mapping PID hex codes to three-state results
          - "report": str, the formatted console report
          - "support_matrix": str, the tabular PID|Name|Supported|Available|Value|Reason summary

    Raises:
        RuntimeError: if supported PID discovery fails (no Mode 01 PIDs found)
    """
    # Discover supported PIDs — abort if discovery fails (FR-016)
    discovered = read_supported_pids(adapter)
    supported_mode01 = set(discovered.get("01", []))

    if not supported_mode01:
        raise RuntimeError(
            "Extended PID validation aborted. Supported PID discovery failed."
        )

    # Classify PIDs into supported and unsupported based on bitmap
    results: Dict[str, Any] = {}

    for pid_hex, reader_fn in CONFIGURED_EXTENDED_PIDS.items():
        if pid_hex in supported_mode01:
            # PID is in the vehicle bitmap — read it
            result = reader_fn(adapter)

            # Preserve actual reader result without normalization.
            # If a reader returns supported=False for a PID that was in the
            # bitmap, we surface that discrepancy as-is with a reason field.
            if not result.get("supported", False):
                # Reader returned unsupported for a PID that was in the bitmap.
                # Add a reason to explain the discrepancy.
                result["reason"] = _classify_unavailable_reason(result)
            elif not result.get("available", True):
                # Reader returned supported but unavailable — add reason.
                result["reason"] = _classify_unavailable_reason(result)

            results[pid_hex] = result
        else:
            # PID is NOT in the vehicle bitmap — mark as unsupported
            unit = EXTENDED_PID_UNITS.get(pid_hex, "")
            results[pid_hex] = _unsupported_pid_result(pid_hex, unit)

    # Generate report and support matrix
    report = format_validation_report(results, EXTENDED_PID_NAMES, EXTENDED_PID_UNITS)
    support_matrix = format_support_matrix(results, EXTENDED_PID_NAMES, EXTENDED_PID_UNITS)

    return {
        "pids": results,
        "report": report,
        "support_matrix": support_matrix,
    }


def _classify_unavailable_reason(result: Dict[str, Any]) -> str:
    """Classify why a PID read failed based on the reader result.

    Returns one of:
      - "NO_DATA": adapter returned no response (rawResponse is None)
      - "PREFIX_MISMATCH": response prefix doesn't match expected PID
      - "INVALID_RESPONSE": response couldn't be parsed (malformed hex, too few bytes)
    """
    raw = result.get("rawResponse")

    # If adapter returned nothing at all, it's NO DATA
    if raw is None:
        return "NO_DATA"

    # If raw response exists but result is unavailable, classify by what we can infer
    # Prefix mismatch is already detected by the reader (hex_str doesn't start with prefix)
    # Invalid response is detected when parsing fails or bytes are insufficient
    pid = result.get("pid", "")
    expected_prefix = f"41{pid}"

    if raw and not raw.startswith(expected_prefix):
        return "PREFIX_MISMATCH"

    # Default to INVALID_RESPONSE for other parsing failures
    return "INVALID_RESPONSE"


def format_validation_report(
    results: Dict[str, Any],
    pid_names: Dict[str, str],
    pid_units: Dict[str, str],
) -> str:
    """Generate a detailed validation report.

    Format:
        ===== EXTENDED PID VALIDATION =====

        PID 06 STFT Bank 1
        Supported: YES
        Available: YES
        Raw Response: 410680
        Value: 0.0 %
        Reason: (only shown if available=false)

        ===== END VALIDATION =====
    """
    lines = ["===== EXTENDED PID VALIDATION =====", ""]

    for pid_hex, result in results.items():
        name = pid_names.get(pid_hex, f"PID {pid_hex}")
        unit = pid_units.get(pid_hex, "")
        supported = result.get("supported", False)
        available = result.get("available", False)

        lines.append(f"PID {pid_hex} {name}")
        lines.append(f"Supported: {'YES' if supported else 'NO'}")

        if supported:
            lines.append(f"Available: {'YES' if available else 'NO'}")
            raw = result.get("rawResponse")
            if raw is not None:
                lines.append(f"Raw Response: {raw}")
            if available:
                value = result.get("value")
                if value is not None:
                    lines.append(f"Value: {value} {unit}")
            else:
                reason = result.get("reason")
                if reason:
                    lines.append(f"Reason: {reason}")
        else:
            # PID not supported by reader (e.g., NO DATA from adapter)
            reason = result.get("reason")
            if reason:
                lines.append(f"Reason: {reason}")

        lines.append("")

    lines.append("===== END VALIDATION =====")
    return "\n".join(lines)


def format_support_matrix(
    results: Dict[str, Any],
    pid_names: Dict[str, str],
    pid_units: Dict[str, str],
) -> str:
    """Generate a tabular support matrix summary.

    Format:
        PID | Name | Supported | Available | Value | Reason
        06  | STFT Bank 1 | YES | YES | 0.0 % | -
        07  | LTFT Bank 1 | YES | NO  | -     | NO_DATA
    """
    header = "PID | Name | Supported | Available | Value | Reason"
    separator = "--- | --- | --- | --- | --- | ---"
    rows = [header, separator]

    for pid_hex, result in results.items():
        name = pid_names.get(pid_hex, f"PID {pid_hex}")
        unit = pid_units.get(pid_hex, "")
        supported = result.get("supported", False)
        available = result.get("available", False)

        supported_str = "YES" if supported else "NO"
        available_str = "YES" if (supported and available) else ("NO" if supported else "-")

        if supported and available:
            value = result.get("value")
            value_str = f"{value} {unit}" if value is not None else "-"
        else:
            value_str = "-"

        reason = result.get("reason", "")
        reason_str = reason if reason else "-"

        rows.append(
            f"{pid_hex} | {name} | {supported_str} | {available_str} | {value_str} | {reason_str}"
        )

    return "\n".join(rows)