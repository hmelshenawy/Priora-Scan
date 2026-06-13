class MockObdAdapter:
    protocol = "MOCK"
    adapter_type = "MOCK"
    fault_metadata = {
        "P0301": {"status": "ACTIVE", "ecu": "ECM"},
        "P0171": {"status": "PENDING", "ecu": "ECM"},
        "U0100": {"status": "ACTIVE", "ecu": "TCM"},
    }

    def __init__(self):
        self._dtcs_logged = False
        self._dtcs_cleared = False
        print("Using mock OBD adapter")

    def connect(self) -> bool:
        return True

    def is_connected(self) -> bool:
        return True

    def send(self, command: str) -> bytes:
        if command == "0902":
            print("Mock VIN read")
            return b"49025744443231333030343141313233343536"

        if command in {"03", "07", "0A"}:
            # After DTC clear, return zero codes
            if self._dtcs_cleared:
                return {"03": b"4300", "07": b"4700", "0A": b"4A00"}[command]
            if not self._dtcs_logged:
                print("Mock DTCs read")
                self._dtcs_logged = True
            responses = {
                "03": b"43020301C100",
                "07": b"47010171",
                "0A": b"4A00",
            }
            return responses[command]

        # ---- Feature 009 Phase A: Vehicle Data PIDs ----

        # PID 01 — Readiness Monitors
        # Byte layout: [MIL+DTCcnt, 00, supported_lo, supported_hi, complete_lo, complete_hi]
        # supported_lo=0x07 (misfire+fuelSystem+components), supported_hi=0xFF (all upper)
        # complete_lo=0x07, complete_hi=0xEF (all except AC refrig)
        if command == "0101":
            print("Mock readiness monitors")
            return b"41010007FF07EF"

        # PID 03 — Fuel System Status
        # Byte A=0x02 (Closed Loop), Byte B=0x00
        if command == "0103":
            print("Mock fuel system status")
            return b"41030200"

        # PID 04 — Calculated Engine Load
        # A=0x80 → 50.2%
        if command == "0104":
            print("Mock engine load")
            return b"410480"

        # PID 2F — Fuel Level Input
        # A=0xCC → 80%
        if command == "012F":
            print("Mock fuel level")
            return b"412FCC"

        # PID 31 — Distance Since DTC Clear (mileage proxy)
        # A=0x27, B=0x10 → 10000 km
        if command == "0131":
            print("Mock mileage")
            return b"41312710"

        # PID 42 — Battery / Control Module Voltage
        # A=0x36, B=0xD4 → (54*256 + 212)/1000 = 14.064V → rounds to 14.1V
        if command == "0142":
            print("Mock battery voltage")
            return b"414236D4"

        # PID 00 — Supported PIDs 01-20
        # Bitmask: PIDs 01,03,04,05,06,07,0F,1F,20 supported
        # 0xBE1F B820 → bytes 0xBE 0x1F 0xB8 0x20
        if command == "0100":
            print("Mock supported PIDs 01-20")
            return b"4100BE1FB820"

        # PID 20 — Supported PIDs 21-40
        # PIDs 21,2F,31,42 supported → 0x81 0x00 0x84 0x02
        if command == "0120":
            print("Mock supported PIDs 21-40")
            return b"412081008402"

        # Mode 09 PID 00 — Supported Mode 09 PIDs
        # Bit 1 = PID 02 supported → 0x02 0x00 0x00 0x00
        if command == "0900":
            print("Mock Mode 09 supported PIDs")
            return b"490002000000"

        # ---- Feature 009 Phase B: Clear DTC ----
        # Mode 04 — positive response "44"
        if command == "04":
            print("Mock clear DTC")
            self._dtcs_cleared = True
            return b"44"

        return b""

    def close(self):
        pass