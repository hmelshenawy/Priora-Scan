"""Toyota Real Sample mock vehicle profile.

Captured from actual vehicle ECU communication using a WiFi ELM327 adapter.
All values are raw OBD response bytes — the existing parsers decode them
into human-readable values (e.g., 410C0E10 → 900 RPM).

Vehicle characteristics:
  RPM: 900
  Speed: 0 km/h (parked)
  Coolant: 86 °C
  Engine Load: 46.3%
  Voltage: 13.417 V
  Fuel Level: unsupported (NO DATA)
  VIN: unsupported (all-FF payload)
  Fault codes: none
"""

# Profile identity
PROFILE_NAME = "toyota_real_sample"
PROFILE_DESCRIPTION = "Toyota real sample — captured vehicle data, no faults, unsupported VIN"

# OBD PID responses (command string → raw bytes)
PID_RESPONSES = {
    # PID 00 — Supported PIDs 01-20
    # Bitmask BE1FB813: PIDs 01,03,04,05,06,07,0F,10,11,12,13,1A,1D,1E supported
    # Last byte 0x13 = 00010011: bit 32 = 1 → 0120 must be queried (chain continues)
    "0100": bytes.fromhex("4100BE1FB813"),
    # PID 20 — Supported PIDs 21-40
    # Bitmask 00000001: no PIDs 21-3F supported (including 0x2F Fuel Level),
    # but bit 32 = 1 → 0140 must be queried (chain continues)
    "0120": bytes.fromhex("412000000001"),
    # PID 40 — Supported PIDs 41-60
    # Bitmask 40000000: PID 0x42 (Control Module Voltage) supported
    # bit 32 = 0 → chain stops, no further ranges
    "0140": bytes.fromhex("414040000000"),
    # PID 04 — Calculated Engine Load (A=0x76 → 46.3%)
    "0104": bytes.fromhex("410476"),
    # PID 05 — Coolant Temperature (A=0x7E → 86°C)
    "0105": bytes.fromhex("41057E"),
    # PID 0C — Engine RPM ((0E×256+10)/4 = 900 RPM)
    "010C": bytes.fromhex("410C0E10"),
    # PID 0D — Vehicle Speed (A=0x00 → 0 km/h)
    "010D": bytes.fromhex("410D00"),
    # PID 42 — Control Module Voltage ((34×256+69)/1000 = 13.417V)
    "0142": bytes.fromhex("41423469"),
}

# VIN response (Mode 09 PID 02)
# All-FF payload — VIN not supported by vehicle
# Format: 4902 + 17 bytes of 0xFF (no frame counter, consistent with valid VINs)
VIN_RESPONSE = bytes.fromhex("4902" + "FF" * 17)

# DTC responses (mode string → raw bytes)
# No fault codes in this vehicle
DTC_RESPONSES = {
    "03": bytes.fromhex("4300"),  # No DTCs
    "07": bytes.fromhex("4700"),  # No pending DTCs
    "0A": bytes.fromhex("4A00"),  # No permanent DTCs
}

# Mode 04 (Clear DTC) response
CLEAR_DTC_RESPONSE = bytes.fromhex("44")

# Fault metadata (no faults in this profile)
FAULT_METADATA = {}

# Commands that return empty bytes (unsupported/no data)
UNSUPPORTED_COMMANDS = {
    "012F",  # Fuel Level Input — not supported (not in 0120 bitmap)
    "0900",  # Mode 09 supported PIDs — not supported (except 02)
}

# Optional readiness monitors (None = unsupported)
READINESS_MONITORS = None