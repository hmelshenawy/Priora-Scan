class ScanJob:
    def __init__(
        self,
        id: str,
        status: str,
        created_at: str,
        vin: str = None,
        vehicle_id: str = None,
        diagnostic_session_id: str = None,
    ):
        self.id = id
        self.status = status
        self.created_at = created_at
        self.vin = vin
        self.vehicle_id = vehicle_id
        self.diagnostic_session_id = diagnostic_session_id

    @classmethod
    def from_api(cls, data: dict) -> "ScanJob":
        return cls(
            id=data["id"],
            status=data["status"],
            created_at=data.get("createdAt"),
            vin=data.get("vin"),
            vehicle_id=data.get("vehicleId"),
            diagnostic_session_id=data.get("diagnosticSessionId"),
        )
