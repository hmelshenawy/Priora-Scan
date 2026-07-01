from prioracan.errors import CanAdapterError


class IsoTpError(CanAdapterError):
    """Base class for ISO-TP transport errors."""


class IsoTpTimeoutError(IsoTpError):
    """Raised when a bounded ISO-TP wait expires."""


class IsoTpSequenceError(IsoTpError):
    """Raised when consecutive-frame ordering is invalid."""


class IsoTpFlowControlError(IsoTpError):
    """Raised when peer flow-control status aborts a transfer."""


class IsoTpFrameFormatError(IsoTpError):
    """Raised when ISO-TP frame bytes are malformed."""


class IsoTpBufferOverflowError(IsoTpError):
    """Raised when a payload exceeds the configured ISO-TP limit."""
