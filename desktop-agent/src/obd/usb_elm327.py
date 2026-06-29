from src.obd.adapter import BaseAdapter
from src.obd.adapter_lock import adapter_command_lock


class Elm327Adapter(BaseAdapter):
    adapter_type = "ELM327_USB"
    protocol = "ISO_15765_4_CAN"

    def __init__(self, port: str = None):
        self.port = port
        self._connection = None

    def connect(self) -> bool:
        """Establish USB serial connection and initialize ELM327.

        Delegates to existing lazy-connect logic in is_connected().
        """
        try:
            if not self._connection:
                from src.obd.connection.usb import UsbConnection
                self._connection = UsbConnection(self.port)
                self._connection.open()
            return self._connection.is_open()
        except Exception:
            return False

    def is_connected(self) -> bool:
        try:
            from src.obd.connection.usb import UsbConnection

            if not self._connection:
                self._connection = UsbConnection(self.port)
                self._connection.open()
            return self._connection.is_open()
        except Exception:
            return False

    def send(self, command: str) -> bytes:
        with adapter_command_lock(self):
            if not self.is_connected():
                raise RuntimeError("Adapter not connected")
            self._connection.write(command.encode() + b"\r")
            return self._connection.read()

    def close(self):
        if self._connection:
            self._connection.close()
            self._connection = None
