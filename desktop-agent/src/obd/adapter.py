# Abstract adapter interface — all concrete adapters implement these methods

class BaseAdapter:
    def is_connected(self) -> bool:
        raise NotImplementedError()

    def send(self, command: str) -> bytes:
        raise NotImplementedError()

    def close(self):
        raise NotImplementedError()
