from src.obd.elm327 import Elm327Adapter


def read_vin(adapter: Elm327Adapter) -> str:
    raw = adapter.send("0902")
    hex_str = raw.decode("utf-8", errors="ignore").replace(" ", "").replace("\r", "").replace("\n", "")
    if not hex_str.startswith("4902"):
        raise RuntimeError("Unexpected VIN response")
    data = hex_str[4:]
    vin = bytearray.fromhex(data).decode("ascii", errors="ignore")
    if len(vin) != 17:
        raise RuntimeError("Invalid VIN length")
    return vin
