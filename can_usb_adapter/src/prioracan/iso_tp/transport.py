import time
from dataclasses import dataclass
from typing import Callable

from prioracan.errors import CanAdapterError
from prioracan.frame import CanFrame, Direction
from prioracan.iso_tp.config import IsoTpConfig
from prioracan.iso_tp.errors import (
    IsoTpBufferOverflowError,
    IsoTpFlowControlError,
    IsoTpFrameFormatError,
    IsoTpSequenceError,
    IsoTpTimeoutError,
)
from prioracan.iso_tp.flow_control import (
    FlowControlParameters,
    FlowStatus,
    decode_flow_control,
    encode_flow_control,
)
from prioracan.iso_tp.frames import (
    FrameType,
    decode_consecutive_frame,
    decode_first_frame,
    decode_single_frame,
    encode_consecutive_frame,
    encode_first_frame,
    encode_single_frame,
    parse_pci,
)
@dataclass(slots=True)
class _TransferState:
    direction: str
    length: int = 0
    buffer: bytes = b""
    expected_sequence: int = 1
    tx_payload: bytes = b""
    tx_offset: int = 0
    tx_sequence: int = 1
    deadline: float | None = None


class IsoTpTransport:
    def __init__(
        self,
        capture_session,
        *,
        config: IsoTpConfig,
        on_payload: Callable[[bytes], None] | None = None,
    ) -> None:
        self._capture_session = capture_session
        self._config = config
        self._on_payload = on_payload
        self._started = False
        self._disposed = False
        self._transfer_state: _TransferState | object | None = None
        self._listener_registered = False

    @property
    def is_busy(self) -> bool:
        return self._transfer_state is not None

    def start(self) -> None:
        self._ensure_available()
        self._register_listener()
        self._started = True

    def stop(self) -> None:
        self._ensure_available()
        self._transfer_state = None
        self._started = False

    def dispose(self) -> None:
        self._transfer_state = None
        self._started = False
        self._disposed = True

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        self.dispose()

    def send_payload(self, payload: bytes) -> None:
        """Send one complete payload using SF or FF/CF segmentation."""
        self._ensure_ready()
        if self.is_busy:
            raise CanAdapterError("ISO-TP transfer already active")
        if len(payload) > self._config.max_payload_bytes:
            raise IsoTpBufferOverflowError("payload exceeds ISO-TP limit")
        if len(payload) > 7:
            self._start_multi_frame_transmit(payload)
            return
        self._transfer_state = _TransferState("tx")
        try:
            self._capture_session.send_frame(self._make_frame(encode_single_frame(payload)))
        finally:
            self._transfer_state = None

    def process_frame(self, frame: CanFrame) -> None:
        """Process one incoming CAN frame for this configured peer."""
        self._ensure_ready()
        self._ensure_session_running()
        if not self._matches_configured_rx(frame):
            return
        frame_type = parse_pci(frame.data)
        if frame_type is FrameType.SINGLE_FRAME:
            self._deliver(decode_single_frame(frame.data).payload)
        elif frame_type is FrameType.FIRST_FRAME:
            self._handle_first_frame(frame.data)
        elif frame_type is FrameType.CONSECUTIVE_FRAME:
            self._handle_consecutive_frame(frame.data)
        elif frame_type is FrameType.FLOW_CONTROL:
            self._handle_flow_control(frame.data)

    def check_timeouts(self) -> None:
        """Raise IsoTpTimeoutError when the active wait deadline expires."""
        state = self._active_state()
        if state.deadline is not None and time.monotonic() >= state.deadline:
            self._abort()
            raise IsoTpTimeoutError("ISO-TP transfer timed out")

    def _start_multi_frame_transmit(self, payload: bytes) -> None:
        self._transfer_state = _TransferState(
            "tx",
            length=len(payload),
            tx_payload=payload,
            tx_offset=6,
            tx_sequence=1,
            deadline=self._flow_control_deadline(),
        )
        first = encode_first_frame(len(payload), payload[:6])
        try:
            self._capture_session.send_frame(self._make_frame(first))
        except CanAdapterError:
            self._abort()
            raise

    def _handle_flow_control(self, data: bytes) -> None:
        try:
            parameters = decode_flow_control(data)
        except IsoTpFrameFormatError:
            self._abort()
            raise
        if parameters.status is not FlowStatus.CTS:
            self._abort()
            raise IsoTpFlowControlError("flow-control status aborted transfer")
        self._send_consecutive_frames(parameters)

    def _send_consecutive_frames(self, parameters: FlowControlParameters) -> None:
        state = self._tx_state()
        sent_in_block = 0
        while state.tx_offset < state.length:
            if parameters.block_size and sent_in_block >= parameters.block_size:
                state.deadline = self._flow_control_deadline()
                return
            chunk = state.tx_payload[state.tx_offset : state.tx_offset + 7]
            frame = encode_consecutive_frame(state.tx_sequence, chunk)
            try:
                self._capture_session.send_frame(self._make_frame(frame))
            except CanAdapterError:
                self._abort()
                raise
            state.tx_offset += len(chunk)
            state.tx_sequence = (state.tx_sequence + 1) % 16
            sent_in_block += 1
        self._abort()

    def _tx_state(self) -> _TransferState:
        if not isinstance(self._transfer_state, _TransferState):
            raise CanAdapterError("ISO-TP transfer is not active")
        if self._transfer_state.direction != "tx":
            raise IsoTpFrameFormatError("flow control arrived while not transmitting")
        return self._transfer_state

    def _handle_first_frame(self, data: bytes) -> None:
        if self.is_busy:
            self._abort()
            raise IsoTpFrameFormatError("first frame arrived during transfer")
        frame = decode_first_frame(data)
        self._validate_first_frame_length(frame.length)
        self._transfer_state = _TransferState(
            "rx",
            frame.length,
            frame.payload,
            1,
            deadline=self._consecutive_frame_deadline(),
        )
        try:
            self._send_cts()
        except CanAdapterError:
            self._abort()
            raise
        self._complete_if_ready()

    def _handle_consecutive_frame(self, data: bytes) -> None:
        state = self._rx_state()
        frame = decode_consecutive_frame(data)
        if frame.sequence_number != state.expected_sequence:
            self._abort()
            raise IsoTpSequenceError("unexpected consecutive-frame sequence")
        self._append_consecutive_payload(frame.payload)

    def _append_consecutive_payload(self, payload: bytes) -> None:
        state = self._rx_state()
        if len(state.buffer) + len(payload) > state.length:
            self._abort()
            raise IsoTpFrameFormatError("consecutive-frame payload overrun")
        state.buffer += payload
        state.expected_sequence = (state.expected_sequence + 1) % 16
        state.deadline = self._consecutive_frame_deadline()
        self._complete_if_ready()

    def _complete_if_ready(self) -> None:
        state = self._rx_state()
        if len(state.buffer) >= state.length:
            payload = state.buffer[: state.length]
            self._abort()
            self._deliver(payload)

    def _rx_state(self) -> _TransferState:
        if not isinstance(self._transfer_state, _TransferState):
            raise IsoTpFrameFormatError("consecutive frame arrived while idle")
        if self._transfer_state.direction != "rx":
            raise CanAdapterError("ISO-TP transfer already active")
        return self._transfer_state

    def _validate_first_frame_length(self, length: int) -> None:
        if length < 8:
            raise IsoTpFrameFormatError("invalid first-frame length")
        if length > self._config.max_payload_bytes:
            raise IsoTpBufferOverflowError("first-frame length exceeds limit")

    def _send_cts(self) -> None:
        parameters = FlowControlParameters(
            FlowStatus.CTS,
            block_size=self._config.block_size,
            st_min_ms=self._config.st_min_ms,
        )
        self._capture_session.send_frame(self._make_frame(encode_flow_control(parameters)))

    def _deliver(self, payload: bytes) -> None:
        if self._on_payload is not None:
            self._on_payload(payload)

    def _abort(self) -> None:
        self._transfer_state = None

    def _active_state(self) -> _TransferState:
        if not isinstance(self._transfer_state, _TransferState):
            raise CanAdapterError("ISO-TP transfer is not active")
        return self._transfer_state

    def _flow_control_deadline(self) -> float:
        return time.monotonic() + self._config.wait_for_flow_control_seconds

    def _consecutive_frame_deadline(self) -> float:
        return time.monotonic() + self._config.wait_for_consecutive_frame_seconds

    def _ensure_session_running(self) -> None:
        if not getattr(self._capture_session, "is_running", False):
            self._abort()
            raise CanAdapterError("capture session is not running")

    def _register_listener(self) -> None:
        if self._listener_registered or not hasattr(self._capture_session, "add_frame_listener"):
            return
        self._capture_session.add_frame_listener(self.process_frame)
        self._listener_registered = True

    def _make_frame(self, data: bytes) -> CanFrame:
        return CanFrame(
            timestamp=0.0,
            channel=getattr(self._capture_session.config, "channel", 0),
            direction=Direction.RX,
            arbitration_id=self._config.tx_arbitration_id,
            is_extended_id=self._config.is_extended_id,
            is_remote_frame=False,
            is_error_frame=False,
            dlc=len(data),
            data=data,
        )

    def _matches_configured_rx(self, frame: CanFrame) -> bool:
        return (
            frame.arbitration_id == self._config.rx_arbitration_id
            and frame.is_extended_id == self._config.is_extended_id
        )

    def _ensure_ready(self) -> None:
        self._ensure_available()
        if not self._started:
            raise CanAdapterError("ISO-TP transport is not started")

    def _ensure_available(self) -> None:
        if self._disposed:
            raise CanAdapterError("ISO-TP transport is disposed")
