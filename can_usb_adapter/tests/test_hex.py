from prioracan.utils.hex import arbitration_id_hex, data_hex


def test_arbitration_id_hex_is_uppercase_with_prefix() -> None:
    assert arbitration_id_hex(0x4D2) == "0x4D2"


def test_data_hex_empty_bytes() -> None:
    assert data_hex(b"") == ""


def test_data_hex_multi_byte_space_separated_uppercase() -> None:
    assert data_hex(bytes([0x01, 0xAB, 0xFF])) == "01 AB FF"
