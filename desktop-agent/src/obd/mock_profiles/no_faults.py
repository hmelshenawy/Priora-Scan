"""No Faults mock vehicle profile.

A clean vehicle with valid VIN, standard PIDs, and no fault codes.
Useful for testing the happy path of diagnostic workflows.

Vehicle characteristics:
  VIN: JTDBR32E720123456
  Fault codes: none
  Standard PIDs supported
"""

# Profile identity
PROFILE_NAME = "no_faults"
PROFILE_DESCRIPTION = "Clean vehicle with valid VIN and no fault codes"

# OBD PID responses (command string → raw bytes)
PID_RESPONSES = {
    # PID 00 — Supported PIDs 01-20 (matches default profile)
    "0100": bytes.fromhex("4100BE1FB820"),
    # PID 01 — Readiness Monitors
    "0101": bytes.fromhex("41010007FF07EF"),
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
# Decodes to: JTDBR32E720123456
VIN_RESPONSE = bytes.fromhex("49024A54444252333245373230313233343536")

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
UNSUPPORTED_COMMANDS = set()

# Optional readiness monitors (None = unsupported)
READINESS_MONITORS = None