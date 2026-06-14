"""Clear DTC command — Feature 009 Phase B.

Sends OBD-II Mode 04 (Clear DTCs / Freeze Frame) to the adapter
and returns a result dict indicating success or failure.

Mode 04 typically returns no data bytes — success is indicated by
the adapter returning a ``44`` response prefix (Mode 04 positive
response). If the adapter returns an error or no data, the clear
is considered failed.
"""

from __future__ import annotations

import logging
from typing import Dict, Any

from src.obd.adapter import BaseAdapter
from src.obd.commands.elm_parser import compact_raw_response, is_adapter_error_response

logger = logging.getLogger(__name__)


def clear_dtc(adapter: BaseAdapter) -> Dict[str, Any]:
    """Send Mode 04 (Clear DTCs) and return a result dict.

    Returns:
        On success:  ``{ "success": True }``
        On failure:  ``{ "success": False, "reason": "<description>" }``
    """
    command = "04"
    try:
        raw = adapter.send(command)
        if not raw:
            logger.warning("clear_dtc: adapter returned empty response")
            return {"success": False, "reason": "No response from adapter"}

        hex_str = compact_raw_response(raw, command=command)
        if not hex_str:
            logger.warning("clear_dtc: adapter returned empty hex response")
            return {"success": False, "reason": "Empty response from adapter"}
        if is_adapter_error_response(hex_str):
            logger.warning("clear_dtc: adapter returned error response: %s", hex_str)
            return {"success": False, "reason": hex_str}

        # Mode 04 positive response prefix is "44"
        if hex_str.startswith("44"):
            logger.info("clear_dtc: Mode 04 clear succeeded")
            return {"success": True}

        # Check for common error response (7F 04 — negative response)
        if hex_str.startswith("7F"):
            error_byte = hex_str[4:6] if len(hex_str) >= 6 else "??"
            logger.warning("clear_dtc: negative response 7F 04 %s", error_byte)
            return {
                "success": False,
                "reason": f"ECU rejected clear command (negative response code: 0x{error_byte})",
            }

        logger.warning("clear_dtc: unexpected response prefix: %s", hex_str[:4])
        return {
            "success": False,
            "reason": f"Unexpected response from adapter: {hex_str[:8]}",
        }
    except Exception as exc:
        logger.error("clear_dtc: exception during clear: %s", exc)
        return {"success": False, "reason": str(exc)}
