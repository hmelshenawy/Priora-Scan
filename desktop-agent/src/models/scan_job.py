class ScanJob:
    def __init__(self, id: str, status: str, created_at: str):
        self.id = id
        self.status = status
        self.created_at = created_at

    @classmethod
    def from_api(cls, data: dict) -> "ScanJob":
        return cls(id=data["id"], status=data["status"], created_at=data.get("createdAt"))
