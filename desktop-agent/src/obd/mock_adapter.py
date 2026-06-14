"""Mock OBD adapter that delegates response generation to a vehicle profile.

Refactored from hardcoded responses to a profile-based system where
each mock vehicle is a self-contained module file. The active profile
is selected via the OBD_MOCK_PROFILE environment variable.
"""

import logging
import os

from src.config import OBD_MOCK_PROFILE

logger = logging.getLogger(__name__)


class MockObdAdapter:
    """OBD adapter that returns realistic vehicle responses from a mock profile.

    Delegates response generation to the active mock profile loaded via
    ProfileRegistry. Preserves the _dtcs_cleared state behavior for
    Mode 04 (clear DTC).
    """

    protocol = "MOCK"
    adapter_type = "MOCK"

    def __init__(self, profile_name: str | None = None):
        """Initialize with a specific profile, or auto-detect from config.

        Args:
            profile_name: Override profile name. If None, uses
                OBD_MOCK_PROFILE from config.
        """
        from src.obd.mock_profiles.profile_registry import ProfileRegistry

        self._registry = ProfileRegistry()
        name = profile_name or os.getenv("OBD_MOCK_PROFILE", OBD_MOCK_PROFILE)
        self._profile = self._registry.get_profile(name)
        self._dtcs_cleared = False
        self._dtcs_logged = False
        logger.info("Using mock OBD adapter with profile: %s", name)

    @property
    def fault_metadata(self) -> dict:
        """Delegate to the active profile's FAULT_METADATA."""
        return getattr(self._profile, "FAULT_METADATA", {})

    def connect(self) -> bool:
        return True

    def is_connected(self) -> bool:
        return True

    def send(self, command: str) -> bytes:
        """Return the profile's response for the given OBD command.

        Profiles store raw OBD bytes (e.g. bytes.fromhex("410476")), but
        the parser functions expect ASCII hex strings (e.g. b"410476").
        This method converts raw bytes to ASCII hex before returning, so
        the same parser code works for both mock and real adapters.

        Lookup order:
        1. Mode 04 (clear DTC) — sets _dtcs_cleared flag
        2. DTC modes (03, 07, 0A) — post-clear returns zero codes
        3. VIN (0902) — returns profile's VIN_RESPONSE
        4. Unsupported commands — returns b""
        5. PID responses — returns profile's PID_RESPONSES[command]
        6. Unknown command — returns b""
        """
        raw = self._get_raw_response(command)
        if not raw:
            return b""
        # Convert raw bytes to ASCII hex string for parser compatibility.
        # Profiles store bytes.fromhex("410476") = b'\x41\x04\x76', but
        # parser functions expect b"410476" (ASCII hex string).
        return raw.hex().upper().encode("ascii")

    def _get_raw_response(self, command: str) -> bytes:
        """Look up the raw bytes for a command from the active profile."""
        # Mode 04 — Clear DTCs (always handled by adapter)
        if command == "04":
            logger.info("Mock clear DTC")
            self._dtcs_cleared = True
            return getattr(self._profile, "CLEAR_DTC_RESPONSE", b"\x44")

        # DTC modes — after DTC clear, return zero-code responses
        if command in {"03", "07", "0A"}:
            if self._dtcs_cleared:
                zero_responses = {
                    "03": bytes.fromhex("4300"),
                    "07": bytes.fromhex("4700"),
                    "0A": bytes.fromhex("4A00"),
                }
                return zero_responses[command]
            if not self._dtcs_logged:
                logger.info("Mock DTCs read")
                self._dtcs_logged = True
            return getattr(self._profile, "DTC_RESPONSES", {}).get(command, b"")

        # VIN (Mode 09 PID 02)
        if command == "0902":
            logger.info("Mock VIN read")
            return getattr(self._profile, "VIN_RESPONSE", b"")

        # Unsupported commands (returns empty bytes = NO DATA)
        unsupported = getattr(self._profile, "UNSUPPORTED_COMMANDS", set())
        if command in unsupported:
            return b""

        # PID responses
        pid_responses = getattr(self._profile, "PID_RESPONSES", {})
        if command in pid_responses:
            return pid_responses[command]

        # Unknown command
        return b""

    def close(self):
        pass
