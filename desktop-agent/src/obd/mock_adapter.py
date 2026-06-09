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
        print("Using mock OBD adapter")

    def is_connected(self) -> bool:
        return True

    def send(self, command: str) -> bytes:
        if command == "0902":
            print("Mock VIN read")
            return b"49025744443231333030343141313233343536"

        if command in {"03", "07", "0A"}:
            if not self._dtcs_logged:
                print("Mock DTCs read")
                self._dtcs_logged = True
            responses = {
                "03": b"43020301C100",
                "07": b"47010171",
                "0A": b"4A00",
            }
            return responses[command]

        return b""

    def close(self):
        pass
