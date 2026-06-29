def arbitration_id_hex(arbitration_id: int) -> str:
    return f"0x{arbitration_id:X}"


def data_hex(data: bytes) -> str:
    return " ".join(f"{byte:02X}" for byte in data)
