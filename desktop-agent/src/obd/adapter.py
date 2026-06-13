# Abstract adapter interface — all concrete adapters implement these methods


class BaseAdapter:
    adapter_type: str = "UNKNOWN"
    protocol: str = "UNKNOWN"

    def connect(self) -> bool:
        """Establish connection and initialize the adapter.

        Returns True if connected and initialized successfully.
        """
        raise NotImplementedError()

    def is_connected(self) -> bool:
        raise NotImplementedError()

    def send(self, command: str) -> bytes:
        raise NotImplementedError()

    def close(self):
        raise NotImplementedError()