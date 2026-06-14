"""WiFi TCP connection to ELM327 OBD adapter.

Connects to ELM327 over TCP socket (default port 35000) and handles
the line-based prompt-delimited protocol (> character).
"""

import logging
import socket
import time

logger = logging.getLogger(__name__)

# Minimum delay between commands per ELM327 datasheet
INTER_COMMAND_DELAY_SECONDS = 0.1


class WifiConnection:
    def __init__(
        self,
        host: str = "192.168.0.10",
        port: int = 35000,
        timeout: float = 5.0,
    ):
        self.host = host
        self.port = port
        self.timeout = timeout
        self._socket: socket.socket | None = None
        self._connected = False
        self._last_command_at: float | None = None

    def open(self) -> None:
        """Establish TCP socket connection to ELM327.

        Raises:
            ConnectionError: If connection is refused or fails.
            TimeoutError: If connection times out.
        """
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            sock.connect((self.host, self.port))
            self._socket = sock
            self._connected = True
            self._last_command_at = None
            logger.info("WiFi connection established to %s:%d", self.host, self.port)
        except socket.timeout as exc:
            raise TimeoutError(
                f"Connection to {self.host}:{self.port} timed out after {self.timeout}s"
            ) from exc
        except ConnectionRefusedError as exc:
            raise ConnectionError(
                f"Connection refused by {self.host}:{self.port}"
            ) from exc
        except OSError as exc:
            raise ConnectionError(
                f"Failed to connect to {self.host}:{self.port}: {exc}"
            ) from exc

    def is_open(self) -> bool:
        """Check if socket is connected and valid."""
        if not self._connected or self._socket is None:
            return False
        # Quick check: is the socket still alive?
        try:
            self._socket.getpeername()
            return True
        except OSError:
            self._connected = False
            return False

    def write(self, data: bytes) -> None:
        """Send bytes to ELM327, enforcing 100ms minimum inter-command delay.

        Raises:
            ConnectionError: If socket is closed.
        """
        if not self.is_open():
            raise ConnectionError("WiFi connection is not open")

        # Enforce inter-command delay
        if self._last_command_at is not None:
            elapsed = time.monotonic() - self._last_command_at
            if elapsed < INTER_COMMAND_DELAY_SECONDS:
                delay = INTER_COMMAND_DELAY_SECONDS - elapsed
                time.sleep(delay)

        try:
            logger.debug("WiFi TX %r", data)
            self._socket.sendall(data)
            self._last_command_at = time.monotonic()
        except OSError as exc:
            self._connected = False
            logger.warning("WiFi write failed: %s", exc)
            raise ConnectionError(f"Write failed: {exc}") from exc

    def read(self) -> bytes:
        """Read response until '>' prompt delimiter or timeout.

        Returns:
            Raw bytes, including the prompt character when present. If bytes
            arrive but no prompt appears before timeout, returns the partial
            response for clone adapters that omit prompts.

        Raises:
            TimeoutError: If zero bytes are received before timeout.
            ConnectionError: If socket is closed.
        """
        if not self.is_open():
            raise ConnectionError("WiFi connection is not open")

        buf = bytearray()
        started_at = time.monotonic()
        prompt_found = False
        try:
            while True:
                chunk = self._socket.recv(256)
                if not chunk:
                    self._connected = False
                    elapsed = time.monotonic() - started_at
                    if buf:
                        logger.warning(
                            "WiFi remote closed after partial RX elapsed=%.3fs bytes=%r",
                            elapsed,
                            bytes(buf),
                        )
                        return bytes(buf)
                    logger.warning("WiFi remote closed with no response")
                    raise ConnectionError("Connection closed by remote")
                buf.extend(chunk)
                logger.debug("WiFi RX chunk %r", chunk)
                if b">" in buf:
                    prompt_found = True
                    break
        except socket.timeout as exc:
            elapsed = time.monotonic() - started_at
            if buf:
                logger.warning(
                    "WiFi RX partial timeout elapsed=%.3fs prompt_found=%s bytes=%r",
                    elapsed,
                    prompt_found,
                    bytes(buf),
                )
                return bytes(buf)
            logger.warning("WiFi RX timeout after %.3fs with zero bytes", elapsed)
            raise TimeoutError(f"Read timed out after {self.timeout}s") from exc
        except OSError as exc:
            self._connected = False
            logger.warning("WiFi read failed: %s", exc)
            raise ConnectionError(f"Read failed: {exc}") from exc

        elapsed = time.monotonic() - started_at
        logger.debug(
            "WiFi RX complete elapsed=%.3fs prompt_found=%s bytes=%r",
            elapsed,
            prompt_found,
            bytes(buf),
        )
        return bytes(buf)

    def close(self) -> None:
        """Close socket connection. Safe to call multiple times."""
        if self._socket is not None:
            try:
                self._socket.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                self._socket.close()
            except OSError:
                pass
            self._socket = None
        self._connected = False
        self._last_command_at = None
        logger.info("WiFi connection closed")
