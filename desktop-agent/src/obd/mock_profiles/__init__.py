"""Mock vehicle profile system for OBD adapter simulation.

Provides realistic vehicle response profiles for development and testing
without requiring physical vehicle or adapter hardware.

Usage:
    Set OBD_MOCK=true and OBD_MOCK_PROFILE=<name> in environment.
    Supported profiles: default, toyota_real_sample, no_faults,
    with_faults, unsupported_vin, toyota_real_faults.
"""

from src.obd.mock_profiles.profile_registry import (
    ProfileRegistry,
    get_active_profile,
    list_profiles,
)

__all__ = ["ProfileRegistry", "get_active_profile", "list_profiles"]