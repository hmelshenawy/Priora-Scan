class FaultCode:
    def __init__(
        self,
        code: str,
        permanent: bool = False,
        status: str = None,
        ecu: str = None,
    ):
        self.code = code
        self.permanent = permanent
        self.status = status or ("PERMANENT" if permanent else "ACTIVE")
        self.ecu = ecu

    def to_dict(self) -> dict:
        data = {
            "code": self.code,
            "permanent": self.permanent,
            "status": self.status,
        }
        if self.ecu:
            data["ecu"] = self.ecu
        return data
