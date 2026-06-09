class FaultCode:
    def __init__(self, code: str, permanent: bool = False):
        self.code = code
        self.permanent = permanent

    def to_dict(self) -> dict:
        return {"code": self.code, "permanent": self.permanent}
