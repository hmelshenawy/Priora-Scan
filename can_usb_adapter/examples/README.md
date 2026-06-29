# Examples

## Manual GS_USB Connection Probe

`probe_gs_usb_connection.py` is a manual hardware-environment probe. It checks
whether the current Python environment can reach a GS_USB/candleLight-compatible
USB-CAN adapter through `python-can`, `gs_usb`, PyUSB, and libusb on Windows.

Run it from this package root:

```powershell
cd can_usb_adapter
python examples/probe_gs_usb_connection.py
```

This probe only checks Python-to-USB connectivity. It does not require the
adapter to be connected to a car, and it does not require CAN traffic. Opening
the bus is the success condition; a receive timeout or no CAN frames is not a
failure for this probe.

If the failure is `usb.core.NoBackendError: No backend available`, PyUSB cannot
find libusb. On Windows, install or copy `libusb-1.0.dll` for the same
architecture as Python, then ensure the DLL is on `PATH` or beside `python.exe`.
Use Zadig/WinUSB only if the libusb backend exists but device access fails.
