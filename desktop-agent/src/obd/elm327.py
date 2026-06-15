"""Compatibility import for the USB ELM327 adapter.

act like a bridge between old elm327 and new usb_elm327 module.

New code should import ``Elm327Adapter`` from ``src.obd.usb_elm327``.
"""

from src.obd.usb_elm327 import Elm327Adapter
