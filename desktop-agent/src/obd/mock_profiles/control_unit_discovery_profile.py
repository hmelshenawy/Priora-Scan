"""Mock vehicle profile for Control Unit Discovery (Feature 019).

Simulates a Toyota-like vehicle with:
- Functional response from 7DF → 7E8 (positive 62F190 VIN response)
- Physical response from 7E0 → 7E8 (positive 62F190 VIN response)
- Physical NO DATA from 7E1-7E7
- At least one positive response scenario (7E3 → 7EB positive 62F190...)
- Multiple functional responders scenario (7DF → 7E8, 7EA, 7EC)
"""

# Profile identity
PROFILE_NAME = "control_unit_discovery"
PROFILE_DESCRIPTION = "Control Unit Discovery — Toyota-like vehicle with functional and physical responders"

# Discovery-specific mock responses
# Format: "ATSH{requestId}" → response for probe "22F190"
# These are keyed by the ATSH command + probe combination.
#
# The mock adapter will look up responses in DISCOVERY_RESPONSES
# when the control unit discovery module sends ATSH + probe commands.

DISCOVERY_RESPONSES = {
    # -----------------------------------------------------------------------
    # Functional discovery (7DF)
    # -----------------------------------------------------------------------
    # Standard functional response: 7E8 responds positively with VIN data.
    "7DF_22F190": "7E81462F19057314B4146344742315246313234333231",

    # -----------------------------------------------------------------------
    # Physical fallback (7E0-7E7)
    # -----------------------------------------------------------------------
    # 7E0 responds (same ECU as functional, positive response)
    "7E0_22F190": "7E81462F19057314B4146344742315246313234333231",

    # 7E1-7E7: NO DATA (no responder at these addresses)
    "7E1_22F190": "NO DATA",
    "7E2_22F190": "NO DATA",
    "7E3_22F190": "NO DATA",
    "7E4_22F190": "NO DATA",
    "7E5_22F190": "NO DATA",
    "7E6_22F190": "NO DATA",
    "7E7_22F190": "NO DATA",
}

# Multi-responder functional scenario
# When mock profile is set to "control_unit_discovery_multiresponder",
# the functional probe 7DF returns 3 responses (7E8, 7EA, 7EC)
MULTI_RESPONDER_DISCOVERY_RESPONSES = {
    # Functional: 3 ECUs respond
    "7DF_22F190": "7E8037F2211\n7EA037F2211\n7EC037F2211",

    # Physical: 7E0 confirms 7E8, 7E2 confirms 7EA
    "7E0_22F190": "7E8037F2211",
    "7E1_22F190": "NO DATA",
    "7E2_22F190": "7EA037F2211",
    "7E3_22F190": "NO DATA",
    "7E4_22F190": "NO DATA",
    "7E5_22F190": "NO DATA",
    "7E6_22F190": "NO DATA",
    "7E7_22F190": "NO DATA",
}

# Positive response scenario
# When mock profile is set to "control_unit_discovery_positive",
# 7E3 returns a positive response (ECU supports F190)
POSITIVE_DISCOVERY_RESPONSES = {
    # Functional: 7E8 responds with negative
    "7DF_22F190": "7E8037F2211",

    # Physical: 7E0 negative, 7E3 positive
    "7E0_22F190": "7E8037F2211",
    "7E1_22F190": "NO DATA",
    "7E2_22F190": "NO DATA",
    "7E3_22F190": "7EB1462F1905A5830314731",  # Positive: 62 F190 + VIN data
    "7E4_22F190": "NO DATA",
    "7E5_22F190": "NO DATA",
    "7E6_22F190": "NO DATA",
    "7E7_22F190": "NO DATA",
}

# Standard OBD PID responses (inherited from default profile for basic operation)
PID_RESPONSES = {
    "0100": bytes.fromhex("4100BE1FB820"),
    "0120": bytes.fromhex("412081008402"),
    "0142": bytes.fromhex("414236D4"),
}

VIN_RESPONSE = bytes.fromhex("490257314B4146344742315246313234333231")

DTC_RESPONSES = {
    "03": bytes.fromhex("4300"),
    "07": bytes.fromhex("4700"),
    "0A": bytes.fromhex("4A00"),
}

CLEAR_DTC_RESPONSE = bytes.fromhex("44")

FAULT_METADATA = {}

UNSUPPORTED_COMMANDS = set()
