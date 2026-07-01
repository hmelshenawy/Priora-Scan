# Manual Real-Vehicle Validation

This note records the manual validation procedure for Feature 022. It is not a CI gate and no automated test depends on hardware.

## Procedure

Run `can_usb_adapter/examples/iso_tp_gs_usb.py` with the target request payload and configured RX/TX arbitration IDs.

Record each run:

| Vehicle | ECU / Address | Payload | Outcome | Notes |
|---------|---------------|---------|---------|-------|
| Toyota | TBD | TBD | Pending manual run | Use `iso_tp_gs_usb.py` with connected GS_USB adapter. |
| Mercedes | TBD | TBD | Pending manual run | Use `iso_tp_gs_usb.py` with connected GS_USB adapter. |

Expected result: Single Frame and multi-frame exchanges complete through `IsoTpTransport` without vehicle-specific code branches.
