"""Profile registry for OBD mock vehicle profiles.

Loads, validates, and returns the active mock profile based on
the OBD_MOCK_PROFILE environment variable. Falls back to 'default'
with a logged warning if the requested profile is invalid.
"""

import logging
from typing import Optional

from src.config import OBD_MOCK_PROFILE

logger = logging.getLogger(__name__)

# Static mapping of profile names to their module import functions.
# Adding a new profile requires: (1) creating the profile module file,
# and (2) adding one line to this dict.
_PROFILES = {
    "default": lambda: _load_module("src.obd.mock_profiles.default"),
    "toyota_real_sample": lambda: _load_module("src.obd.mock_profiles.toyota_real_sample"),
    "no_faults": lambda: _load_module("src.obd.mock_profiles.no_faults"),
    "with_faults": lambda: _load_module("src.obd.mock_profiles.with_faults"),
    "unsupported_vin": lambda: _load_module("src.obd.mock_profiles.unsupported_vin"),
    "toyota_real_faults": lambda: _load_module("src.obd.mock_profiles.toyota_real_faults"),
}

_active_profile = None


def _load_module(module_path: str):
    """Import a profile module and return it."""
    import importlib

    return importlib.import_module(module_path)


class ProfileRegistry:
    """Loads and manages mock vehicle profiles."""

    def __init__(self):
        self._cache = {}

    def get_active_profile(self):
        """Return the active profile based on OBD_MOCK_PROFILE config.

        Falls back to 'default' with a logged warning if the requested
        profile name is invalid or fails to load.
        """
        return self.get_profile(OBD_MOCK_PROFILE)

    def get_profile(self, name: str):
        """Return a specific profile by name.

        Falls back to 'default' with a logged warning if the profile
        name is not in the registry or fails to load.

        Args:
            name: Profile name (e.g., 'toyota_real_sample').

        Returns:
            The profile module with PID_RESPONSES, VIN_RESPONSE, etc.

        Raises:
            RuntimeError: If neither the requested profile nor the
                default profile can be loaded.
        """
        if name in self._cache:
            return self._cache[name]

        if name not in _PROFILES:
            logger.warning(
                "Mock profile '%s' not found, falling back to 'default'. "
                "Available profiles: %s",
                name,
                ", ".join(sorted(_PROFILES.keys())),
            )
            name = "default"

        try:
            module = _PROFILES[name]()
            self._cache[name] = module
            return module
        except Exception as exc:
            logger.error(
                "Failed to load mock profile '%s': %s", name, exc
            )
            if name != "default":
                logger.warning("Falling back to 'default' profile")
                return self.get_profile("default")
            raise RuntimeError(
                f"Could not load default mock profile: {exc}"
            ) from exc

    def list_profiles(self):
        """Return a sorted list of available profile names."""
        return sorted(_PROFILES.keys())


def get_active_profile():
    """Convenience function: return the active profile."""
    return ProfileRegistry().get_active_profile()


def list_profiles():
    """Convenience function: return available profile names."""
    return ProfileRegistry().list_profiles()