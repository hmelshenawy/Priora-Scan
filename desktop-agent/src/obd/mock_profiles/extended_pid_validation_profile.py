"""Extended PID validation mock vehicle profile.

Deterministic responses for all 7 required extended PIDs (06, 07, 08, 09, 0B, 10, 11)
plus basic health PIDs. Designed specifically for Feature 018A testing with known
decode values that can be verified in unit tests.

This profile is NOT derived from real vehicle data — values are chosen for
deterministic decode verification (known hex → known output).

Vehicle characteristics:
  STFT Bank 1: 0.0% (center point, 410680)
  LTFT Bank 1: 0.0% (center point, 410780)
  STFT Bank 2: -0.78% (41067F)
  LTFT Bank 2: 10.16% (41098D)
  MAP: 42 kPa (410B2A)
  MAF: 1.00 g/s (41100064)
  Throttle Position: 1.96% (411105)
  RPM: 900 (410C0E10)
  Coolant: 86°C (41057E)
  Engine Load: 46.3% (410476)
  Vehicle Speed: 0 km/h (410D00)
  Battery Voltage: 13.417V (41423469)
"""

# Profile identity
PROFILE_NAME = "extended_pid_validation"
PROFILE_DESCRIPTION = "Extended PID validation — deterministic responses for all target PIDs"

# OBD PID responses (command string → raw bytes)
PID_RESPONSES = {
    # PID 00 — Supported PIDs 01-20
    # Bitmask 9FB98001:
    #   PIDs 01, 04, 05, 06, 07, 08, 09, 0B, 0C, 0D, 10, 11 supported
    #   Last bit = 1 → 0120 must be queried (chain continues)
    "0100": bytes.fromhex("41009FB98001"),
    # PID 20 — Supported PIDs 21-40
    # Bitmask 00000001: no PIDs 21-3F supported,
    # but bit 32 = 1 → 0140 must be queried (chain continues)
    "0120": bytes.fromhex("412000000001"),
    # PID 40 — Supported PIDs 41-60
    # Bitmask 40000000: PID 0x42 (Control Module Voltage) supported
    # bit 32 = 0 → chain stops
    "0140": bytes.fromhex("414040000000"),

    # Basic health PIDs
    # PID 01 — Readiness Monitors
    "0101": bytes.fromhex("410100044000"),
    # PID 04 — Engine Load (0x76 = 46.3%)
    "0104": bytes.fromhex("410476"),
    # PID 05 — Coolant Temperature (0x7E = 86°C)
    "0105": bytes.fromhex("41057E"),
    # PID 0C — RPM ((0x0E*256+0x10)/4 = 900)
    "010C": bytes.fromhex("410C0E10"),
    # PID 0D — Vehicle Speed (0x00 = 0 km/h)
    "010D": bytes.fromhex("410D00"),
    # PID 42 — Battery Voltage ((0x34*256+0x69)/1000 = 13.417V)
    "0142": bytes.fromhex("41423469"),

    # Extended PIDs — deterministic known values for unit test verification
    # PID 06 — STFT Bank 1 (A=0x80 → (128-128)*100/128 = 0.0%)
    "0106": bytes.fromhex("410680"),
    # PID 07 — LTFT Bank 1 (A=0x80 → 0.0%)
    "0107": bytes.fromhex("410780"),
    # PID 08 — STFT Bank 2 (A=0x7F → (127-128)*100/128 = -0.78%)
    "0108": bytes.fromhex("41087F"),
    # PID 09 — LTFT Bank 2 (A=0x8D → (141-128)*100/128 = 10.16%)
    "0109": bytes.fromhex("41098D"),
    # PID 0B — MAP (A=0x2A → 42 kPa)
    "010B": bytes.fromhex("410B2A"),
    # PID 10 — MAF ((0x00*256+0x64)/100 = 1.00 g/s)
    "0110": bytes.fromhex("41100064"),
    # PID 11 — Throttle Position (A=0x05 → 5*100/255 = 1.96%)
    "0111": bytes.fromhex("411105"),

    # Mode 02 PID 01 — Freeze Frame Data (placeholder)
    "0201": bytes.fromhex("42010000"),
}

# VIN response (Mode 09 PID 02)
# Decodes to: W1KAF4GB1RF124321 (same as default profile for completeness)
VIN_RESPONSE = bytes.fromhex("490257314B4146344742315246313234333231")

# DTC responses (no fault codes)
DTC_RESPONSES = {
    "03": bytes.fromhex("4300"),
    "07": bytes.fromhex("4700"),
    "0A": bytes.fromhex("4A00"),
}

# Mode 04 (Clear DTC) response
CLEAR_DTC_RESPONSE = bytes.fromhex("44")

# Fault metadata (no faults)
FAULT_METADATA = {}

# Commands that return empty bytes (unsupported/no data)
UNSUPPORTED_COMMANDS = set()