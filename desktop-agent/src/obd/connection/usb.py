import serial


class UsbConnection:
    def __init__(self, port: str = None):
        self.port = port or self._auto_detect()
        self._serial = None

    def _auto_detect(self) -> str:
        import serial.tools.list_ports

        ports = serial.tools.list_ports.comports()
        for p in ports:
            if "ELM" in p.description.upper() or "OBD" in p.description.upper():
                return p.device
        raise RuntimeError("No ELM327 adapter found on USB")

    def open(self):
        self._serial = serial.Serial(self.port, baudrate=38400, timeout=2)
        self._serial.write(b"ATZ\r")
        self._serial.read_until(b">")
        self._serial.write(b"ATE0\r")
        self._serial.read_until(b">")

    def is_open(self) -> bool:
        return self._serial is not None and self._serial.is_open

    def write(self, data: bytes):
        self._serial.write(data)

    def read(self) -> bytes:
        return self._serial.read_until(b">")

    def close(self):
        if self._serial and self._serial.is_open:
            self._serial.close()
