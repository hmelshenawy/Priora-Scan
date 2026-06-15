"""Default mock vehicle profile.

Reproduces the exact behavior of the original MockObdAdapter for
backward compatibility. When OBD_MOCK=true with no OBD_MOCK_PROFILE
set (or set to 'default'), the system behaves identically to the
previous hardcoded mock responses.

VIN: W1KAF4GB1RF124321
Fault codes: P0301 (ACTIVE/ECM), P0171 (PENDING/ECM), U0100 (ACTIVE/TCM)
All standard PIDs supported.
"""

# Profile identity
PROFILE_NAME = "default"
PROFILE_DESCRIPTION = "Default mock vehicle (backward compatible with original MockObdAdapter)"

# OBD PID responses (command string → raw bytes)
PID_RESPONSES = {
    # PID 01 — Readiness Monitors (SAE J1979)
    # data[0]=0x00 (MIL OFF, 0 DTCs), data[1]=0x00, data[2]=0x07 (continuous completion),
    # data[3]=0xFF (non-continuous completion), data[4]=0x07 (continuous availability),
    # data[5]=0xFF (non-continuous availability) — all monitors supported and ready
    "0101": bytes.fromhex("4101000007FF07FF"),
    # PID 03 — Fuel System Status (Closed Loop)
    "0103": bytes.fromhex("41030200"),
    # PID 04 — Calculated Engine Load (A=0x80 → 50.2%)
    "0104": bytes.fromhex("410480"),
    # PID 2F — Fuel Level Input (A=0xCC → 80%)
    "012F": bytes.fromhex("412FCC"),
    # PID 31 — Distance Since DTC Clear (A=0x27, B=0x10 → 10000 km)
    "0131": bytes.fromhex("41312710"),
    # PID 42 — Battery / Control Module Voltage
    # (A=0x36, B=0xD4 → (54*256+212)/1000 = 14.064V → 14.1V)
    "0142": bytes.fromhex("414236D4"),
    # PID 00 — Supported PIDs 01-20 (0xBE1FB820)
    "0100": bytes.fromhex("4100BE1FB820"),
    # PID 20 — Supported PIDs 21-40 (0x81008402)
    "0120": bytes.fromhex("412081008402"),
    # Mode 09 PID 00 — Supported Mode 09 PIDs (bit 1 = PID 02)
    "0900": bytes.fromhex("490002000000"),
    # Mode 02 PID 01 — Freeze Frame Data (DTC P0103)
    # RPM=2450, Speed=72, Load≈58%, Coolant=91°C
    # Format: 42 01 [DTC_byte1] [DTC_byte2] [PID] [value] ...
    # DTC P0103: 0x01 0x03
    # PID 04 (Load 58%): 0x94 (148*100/255≈58.04%)
    # PID 05 (Coolant 91°C): 0x83 (131-40=91)
    # PID 0C (RPM 2450): 0x26 0x48 ((0x26*256+0x48)/4=2450.0)
    # PID 0D (Speed 72): 0x48
    "0201": bytes.fromhex("42010103049405830C26480D48"),
}

# VIN response (Mode 09 PID 02)
# Decodes to: W1KAF4GB1RF124321
VIN_RESPONSE = bytes.fromhex("490257314B4146344742315246313234333231")

# DTC responses (mode string → raw bytes, before DTC clear)
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

# Commands that return empty bytes (unsupported PIDs)
UNSUPPORTED_COMMANDS = set()

