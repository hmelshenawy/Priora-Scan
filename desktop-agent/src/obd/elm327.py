from typing import List
from src.models.fault_code import FaultCode


class Elm327Adapter:
    def __init__(self, port: str = None):
        self.port = port
        self._connection = None
        self.protocol = "ISO_15765_4_CAN"
        self.adapter_type = "ELM327"

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
        if not self.is_connected():
            raise RuntimeError("Adapter not connected")
        self._connection.write(command.encode() + b"\r")
        return self._connection.read()

    def close(self):
        if self._connection:
            self._connection.close()
            self._connection = None
