class CanAdapterError(Exception):
    """Base class for all PrioraCAN adapter errors."""


class CanDriverNotFoundError(CanAdapterError):
    """Raised when the requested CAN backend or driver is unavailable."""


class CanDeviceNotFoundError(CanAdapterError):
    """Raised when no compatible CAN adapter device can be found."""


class CanPermissionError(CanAdapterError):
    """Raised when device access is denied by OS or driver permissions."""


class CanConfigurationError(CanAdapterError):
    """Raised when adapter configuration or frame values are invalid."""


class CanConnectionError(CanAdapterError):
    """Raised when a CAN connection is lost or used while disconnected."""


class CanReceiveTimeout(CanAdapterError):
    """Raised when no CAN frame is received before the timeout expires."""


class CanLoggingError(CanAdapterError):
    """Raised when a frame logger cannot open, write, or close safely."""
