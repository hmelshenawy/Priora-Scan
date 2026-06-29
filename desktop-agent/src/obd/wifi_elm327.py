"""WiFi ELM327 OBD adapter — connects to ELM327 over TCP socket.

Handles ELM327 initialization sequence, inter-command delay,
and connection retry with backoff.
"""

import logging
import time

from src.obd.adapter import BaseAdapter
from src.obd.adapter_lock import adapter_command_lock
from src.obd.connection.wifi import WifiConnection
from src.config import OBD_WIFI_HOST, OBD_WIFI_PORT, OBD_WIFI_TIMEOUT_SECONDS

logger = logging.getLogger(__name__)

# ELM327 initialization sequence per datasheet.
# (command, expected_substring_in_response, required)
ELM327_INIT_SEQUENCE = [
    ("ATE0", "OK", False),   # Echo off
    ("ATL0", "OK", False),   # Linefeed off
    ("ATS0", "OK", False),   # Spaces off
    ("ATH0", "OK", False),   # Headers off
    ("ATSP0", "OK", True),   # Auto protocol — REQUIRED
]

CONNECT_RETRIES = 3
CONNECT_BACKOFF_SECONDS = 2
ATZ_TIMEOUT_SECONDS = 10.0


class WifiElm327Adapter(BaseAdapter):
    adapter_type = "ELM327_WIFI"
    protocol = "AUTO"  # Updated after ATSP0 auto-detect

    def __init__(
        self,
        host: str = OBD_WIFI_HOST,
        port: int = OBD_WIFI_PORT,
        timeout: float = OBD_WIFI_TIMEOUT_SECONDS,
    ):
        self._connection = WifiConnection(host=host, port=port, timeout=timeout)
        self._initialized = False
        self.protocol = "AUTO"

    def connect(self) -> bool:
        """Open WiFi connection and run ELM327 init sequence.

        Retries up to 3 times with 2s backoff on connection failure.

        Returns:
            True if connected and initialized successfully.
        """
        for attempt in range(1, CONNECT_RETRIES + 1):
            try:
                logger.info(
                    "Connecting to ELM327 at %s:%d (attempt %d/%d)...",
                    self._connection.host,
                    self._connection.port,
                    attempt,
                    CONNECT_RETRIES,
                )
                self._connection.open()
                # Flush any stale data from the adapter
                time.sleep(0.5)
                if self._run_init_sequence():
                    self._initialized = True
                    logger.info(
                        "ELM327 initialized: %s (%s)",
                        self.adapter_type,
                        self.protocol,
                    )
                    return True
                else:
                    # Init sequence failed — close and retry
                    self._connection.close()
                    if attempt < CONNECT_RETRIES:
                        logger.warning(
                            "Init sequence failed, retrying in %ds...",
                            CONNECT_BACKOFF_SECONDS,
                        )
                        time.sleep(CONNECT_BACKOFF_SECONDS)
            except (ConnectionError, TimeoutError) as exc:
                logger.warning(
                    "Connection attempt %d failed: %s", attempt, exc
                )
                if attempt < CONNECT_RETRIES:
                    logger.info("Retrying in %ds...", CONNECT_BACKOFF_SECONDS)
                    time.sleep(CONNECT_BACKOFF_SECONDS)

        logger.error("Failed to connect after %d attempts", CONNECT_RETRIES)
        self._initialized = False
        return False

    def _run_init_sequence(self) -> bool:
        """Send ELM327 init commands. Returns True on success."""
        if not self._initialize_identity():
            return False

        for cmd, expected, required in ELM327_INIT_SEQUENCE:
            try:
                response = self._send_and_read(cmd + "\r")
                text = response.decode("utf-8", errors="ignore").upper()

                if expected in text:
                    logger.debug("Init %s -> OK: %s", cmd, text.strip())
                    continue

                # Command returned "?" (unsupported) or unexpected response
                if required:
                    logger.error(
                        "Init %s failed (required): response=%s", cmd, text.strip()
                    )
                    return False
                else:
                    logger.warning(
                        "Init %s unexpected response: %s", cmd, text.strip()
                    )
                    # Continue for non-critical init steps

            except (TimeoutError, ConnectionError) as exc:
                if required:
                    logger.error("Init %s failed (required): %s", cmd, exc)
                    return False
                else:
                    logger.warning("Init %s error (non-critical): %s", cmd, exc)

        # After successful init, try to detect the protocol
        try:
            response = self._send_and_read("ATDPN\r")
            proto_text = response.decode("utf-8", errors="ignore").strip().replace(">", "")
            if proto_text:
                self.protocol = proto_text
        except (TimeoutError, ConnectionError):
            # Non-critical — protocol detection is informational
            pass

        return True

    def _initialize_identity(self) -> bool:
        """Reset/detect clone identity before standard initialization."""
        try:
            response = self._send_and_read("ATZ\r", timeout=ATZ_TIMEOUT_SECONDS)
            text = response.decode("utf-8", errors="ignore").upper()
            if "ELM" in text or "OBD" in text or response:
                logger.debug("Init ATZ -> detected adapter: %s", text.strip())
                return True
            logger.warning("Init ATZ returned empty response")
        except TimeoutError as exc:
            logger.warning("Init ATZ timed out, trying ATI once: %s", exc)
        except ConnectionError as exc:
            logger.error("Init ATZ failed: %s", exc)
            return False

        try:
            response = self._send_and_read("ATI\r")
            text = response.decode("utf-8", errors="ignore").upper()
            if "ELM" in text or "OBD" in text or response:
                logger.debug("Init ATI -> detected adapter: %s", text.strip())
                return True
            logger.error("Init ATI returned empty response")
            return False
        except (TimeoutError, ConnectionError) as exc:
            logger.error("Init ATI failed after ATZ timeout: %s", exc)
            return False

    def is_connected(self) -> bool:
        """Check TCP connection + ELM327 responsiveness."""
        if not self._initialized or not self._connection.is_open():
            return False
        return True

    def send(self, command: str) -> bytes:
        """Send OBD command and return raw response.

        Raises:
            RuntimeError: If not connected.
        """
        with adapter_command_lock(self):
            if not self.is_connected():
                raise RuntimeError("WiFi ELM327 adapter not connected")

            return self._send_and_read(command + "\r")

    def _send_and_read(self, command: str, timeout: float | None = None) -> bytes:
        """Low-level send command + CR and read response."""
        command_text = command.strip()
        started_at = time.monotonic()
        original_timeout = getattr(self._connection, "timeout", None)
        logger.info("ELM TX %s", command_text)
        try:
            if timeout is not None:
                self._connection.timeout = timeout
                if getattr(self._connection, "_socket", None) is not None:
                    self._connection._socket.settimeout(timeout)
            self._connection.write(command.encode())
            response = self._connection.read()
            elapsed = time.monotonic() - started_at
            logger.info(
                "ELM RX %s elapsed=%.3fs prompt_found=%s raw=%r",
                command_text,
                elapsed,
                b">" in response,
                response,
            )
            return response
        finally:
            if timeout is not None and original_timeout is not None:
                self._connection.timeout = original_timeout
                if getattr(self._connection, "_socket", None) is not None:
                    self._connection._socket.settimeout(original_timeout)

    def close(self):
        """Close TCP connection."""
        self._connection.close()
        self._initialized = False
        logger.info("WiFi ELM327 adapter closed")
