"""Toyota Real Faults mock vehicle profile.

Combines the real-captured Toyota vehicle health data (identical to
toyota_real_sample) with DTC fault codes P0301, P0171, and U0100.
Enables simultaneous testing of Vehicle Health and DTC workflows
with realistic vehicle data.

Vehicle characteristics:
  RPM: 900 (same as toyota_real_sample)
  Speed: 0 km/h (same as toyota_real_sample)
  Coolant: 86 °C (same as toyota_real_sample)
  Engine Load: 46.3% (same as toyota_real_sample)
  Voltage: 13.417 V (same as toyota_real_sample)
  Fuel Level: unsupported (same as toyota_real_sample)
  VIN: unsupported — all-FF payload (same as toyota_real_sample)
  Fault codes: P0301, P0171, U0100
"""

# Profile identity
PROFILE_NAME = "toyota_real_faults"
PROFILE_DESCRIPTION = "Toyota real data with fault codes P0301, P0171, U0100, unsupported VIN"

# OBD PID responses (command string → raw bytes)
# Identical to toyota_real_sample — captured vehicle data
PID_RESPONSES = {
    # PID 00 — Supported PIDs 01-20
    "0100": bytes.fromhex("4100BE1FB813"),
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
    # PID 01 — Readiness Monitors (SAE J1979)
    # Synthetic readiness data for fault workflow testing. Do not use the
    # real MIL OFF Toyota 2026-06-14 capture here; this profile intentionally
    # simulates MIL ON with 3 stored DTCs to match its fault scenario.
    "0101": bytes.fromhex("4101830007EF07FF"),
}

# VIN response (Mode 09 PID 02)
# All-FF payload — VIN not supported by vehicle (same as toyota_real_sample)
# Format: 4902 + 17 bytes of 0xFF (no frame counter, consistent with valid VINs)
VIN_RESPONSE = bytes.fromhex("4902" + "FF" * 17)

# DTC responses (mode string → raw bytes)
# P0301 (Cylinder 1 Misfire) + P0171 (System Too Lean) — same as with_faults
DTC_RESPONSES = {
    "03": bytes.fromhex("43020301C100"),
    "07": bytes.fromhex("47010171"),
    "0A": bytes.fromhex("4A00"),
}

# Mode 04 (Clear DTC) response
CLEAR_DTC_RESPONSE = bytes.fromhex("44")

# Fault metadata (DTC code → {status, ecu}) — same as with_faults
FAULT_METADATA = {
    "P0301": {"status": "ACTIVE", "ecu": "ECM"},
    "P0171": {"status": "PENDING", "ecu": "ECM"},
    "U0100": {"status": "ACTIVE", "ecu": "TCM"},
}

# Commands that return empty bytes (unsupported/no data)
# Same unsupported PIDs as toyota_real_sample
UNSUPPORTED_COMMANDS = {
    "012F",  # Fuel Level Input — not supported
    "0120",  # Supported PIDs 21-40 — not supported
    "0900",  # Mode 09 supported PIDs — not supported (except 02)
}
