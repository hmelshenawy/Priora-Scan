from prioracan.frame import CanFrame, Direction


SANITIZED_MULTI_FRAME_PAYLOAD = bytes(range(64))
SINGLE_FRAME_BYTES = b"\x03\x22\xf1\x90"
FIRST_FRAME_BYTES = b"\x10\x40" + SANITIZED_MULTI_FRAME_PAYLOAD[:6]
CONSECUTIVE_FRAME_BYTES = b"\x21" + SANITIZED_MULTI_FRAME_PAYLOAD[6:13]
FLOW_CONTROL_CTS_BYTES = b"\x30\x00\x00"


def standard_frame(arbitration_id: int, data: bytes) -> CanFrame:
    return _frame(arbitration_id, data, is_extended_id=False)


def extended_frame(arbitration_id: int, data: bytes) -> CanFrame:
    return _frame(arbitration_id, data, is_extended_id=True)


def single_frame(arbitration_id: int, payload: bytes) -> CanFrame:
    return standard_frame(arbitration_id, bytes([len(payload)]) + payload)


def first_frame(arbitration_id: int, length: int, payload: bytes) -> CanFrame:
    return standard_frame(arbitration_id, bytes([0x10 | (length >> 8), length & 0xFF]) + payload)


def consecutive_frame(arbitration_id: int, sequence_number: int, payload: bytes) -> CanFrame:
    return standard_frame(arbitration_id, bytes([0x20 | sequence_number]) + payload)


def flow_control_frame(arbitration_id: int, block_size: int = 0, st_min_ms: int = 0) -> CanFrame:
    return standard_frame(arbitration_id, bytes([0x30, block_size, st_min_ms]))


def _frame(arbitration_id: int, data: bytes, *, is_extended_id: bool) -> CanFrame:
    return CanFrame(
        timestamp=1.0,
        channel=0,
        direction=Direction.RX,
        arbitration_id=arbitration_id,
        is_extended_id=is_extended_id,
        is_remote_frame=False,
        is_error_frame=False,
        dlc=len(data),
        data=data,
    )
