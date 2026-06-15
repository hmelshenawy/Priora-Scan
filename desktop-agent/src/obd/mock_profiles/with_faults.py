"""With Faults mock vehicle profile.

A vehicle with three fault codes (P0301, P0171, U0100) and valid VIN.
Useful for testing DTC enrichment and fault code display workflows.

Vehicle characteristics:
  VIN: JTDBR32E720123456
  Fault codes: P0301 (Cylinder 1 Misfire), P0171 (System Too Lean), U0100 (Lost Communication With ECM)
  Standard PIDs supported
"""

# Profile identity
PROFILE_NAME = "with_faults"
PROFILE_DESCRIPTION = "Vehicle with fault codes P0301, P0171, U0100 and valid VIN"

# OBD PID responses (command string → raw bytes)
PID_RESPONSES = {
    # PID 00 — Supported PIDs 01-20 (matches default profile)
    "0100": bytes.fromhex("4100BE1FB820"),
    # PID 01 — Readiness Monitors (SAE J1979)
    # data[0]=0x83 (MIL ON, 3 DTCs), data[3]=0xEF (acRefrigerant NOT ready),
    # all monitors supported
    "0101": bytes.fromhex("4101830007EF07FF"),
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
    # Mode 02 PID 01 — Freeze Frame Data (DTC P0301)
    # RPM=1600, Speed=55, Load≈46%, Coolant=86°C
    # DTC P0301: 0x03 0x01
    # PID 04 (Load 46%): 0x76 (118*100/255≈46.27%)
    # PID 05 (Coolant 86°C): 0x7E (0x7E=126, 126-40=86°C)
    # PID 0C (RPM 1600): 0x19 0x00 ((25*256+0)/4=1600.0)
    # PID 0D (Speed 55): 0x37
    "0201": bytes.fromhex("420103010476057E0C19000D37"),
}

# VIN response (Mode 09 PID 02)
# Decodes to: JTDBR32E720123456
VIN_RESPONSE = bytes.fromhex("49024A54444252333245373230313233343536")

# DTC responses (mode string → raw bytes)
# P0301 (Cylinder 1 Misfire) + P0171 (System Too Lean)
DTC_RESPONSES = {
    "03": bytes.fromhex("43020301C100"),
    "07": bytes.fromhex("47010171"),
    "0A": bytes.fromhex("4A00"),
}

# Mode 04 (Clear DTC) response
CLEAR_DTC_RESPONSE = bytes.fromhex("44")

# Fault metadata (DTC code → {status, ecu})
FAULT_METADATA = {
    "P0301": {"status": "ACTIVE", "ecu": "ECM"},
    "P0171": {"status": "PENDING", "ecu": "ECM"},
    "U0100": {"status": "ACTIVE", "ecu": "TCM"},
}

# Commands that return empty bytes (unsupported)
UNSUPPORTED_COMMANDS = set()

