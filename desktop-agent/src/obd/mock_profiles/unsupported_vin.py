"""Unsupported VIN mock vehicle profile.

A vehicle with valid health PIDs but an all-FF VIN payload that
indicates VIN reporting is not supported. Useful for testing graceful
handling of unsupported VIN scenarios.

Vehicle characteristics:
  VIN: Not supported (all-FF payload → "Not supported by vehicle")
  Fault codes: none
  Standard health PIDs supported
"""

# Profile identity
PROFILE_NAME = "unsupported_vin"
PROFILE_DESCRIPTION = "Vehicle with valid health PIDs but unsupported VIN (all-FF payload)"

# OBD PID responses (command string → raw bytes)
PID_RESPONSES = {
    # PID 00 — Supported PIDs 01-20 (matches default profile)
    "0100": bytes.fromhex("4100BE1FB820"),
    # PID 01 — Readiness Monitors (SAE J1979)
    # data[0]=0x00 (MIL OFF, 0 DTCs), all monitors supported and ready
    "0101": bytes.fromhex("4101000007FF07FF"),
    # PID 03 — Fuel System Status (Closed Loop)
    "0103": bytes.fromhex("41030200"),
    # PID 04 — Calculated Engine Load (50.2%)
    "0104": bytes.fromhex("410480"),
    # PID 2F — Fuel Level Input (80%)
    "012F": bytes.fromhex("412FCC"),
    # PID 31 — Distance Since DTC Clear (10000 km)
    "0131": bytes.fromhex("41312710"),
    # PID 42 — Battery Voltage (14.064V)
    "0142": bytes.fromhex("414236D4"),
    # PID 20 — Supported PIDs 21-40
    "0120": bytes.fromhex("412081008402"),
    # Mode 09 PID 00 — Supported Mode 09 PIDs
    "0900": bytes.fromhex("490002000000"),
}

# VIN response (Mode 09 PID 02)
# All-FF payload — VIN not supported by vehicle
# Format: 4902 + 17 bytes of 0xFF (no frame counter, consistent with valid VINs)
VIN_RESPONSE = bytes.fromhex("4902" + "FF" * 17)

# DTC responses (mode string → raw bytes)
# No fault codes
DTC_RESPONSES = {
    "03": bytes.fromhex("4300"),  # No DTCs
    "07": bytes.fromhex("4700"),  # No pending DTCs
    "0A": bytes.fromhex("4A00"),  # No permanent DTCs
}

# Mode 04 (Clear DTC) response
CLEAR_DTC_RESPONSE = bytes.fromhex("44")

# Fault metadata (no faults)
FAULT_METADATA = {}

# Commands that return empty bytes (unsupported)
UNSUPPORTED_COMMANDS = {"0201"}

