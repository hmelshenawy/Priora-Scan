from __future__ import annotations

import ctypes.util
import importlib
import importlib.metadata
import logging
import sys
import traceback
from types import ModuleType
from typing import Any


SUCCESS = 0
UNKNOWN_FAILURE = 1
MISSING_LIBUSB_BACKEND = 2
NO_DEVICE_FOUND = 3
ACCESS_DENIED = 4


def main() -> int:
    print_header("Python")
    print(f"executable: {sys.executable}")
    print(f"version: {sys.version}")

    print_header("Installed packages")
    can_module = describe_import("can", "python-can")
    usb_module = describe_import("usb", "pyusb")
    describe_import("gs_usb", "gs_usb", "gs-usb")

    if can_module is None:
        print_missing_dependency("python-can")
        return UNKNOWN_FAILURE
    if usb_module is None:
        print_missing_dependency("pyusb")
        return UNKNOWN_FAILURE

    backend_status = check_libusb_backend()
    detect_available_configs(can_module)
    open_status = open_gs_usb_bus(can_module)
    if backend_status != SUCCESS and open_status != SUCCESS:
        return backend_status
    return open_status


def print_header(title: str) -> None:
    print()
    print(f"=== {title} ===")


def describe_import(module_name: str, *distribution_names: str) -> ModuleType | None:
    try:
        module = importlib.import_module(module_name)
    except ImportError as exc:
        print(f"{module_name}: NOT INSTALLED ({exc})")
        return None

    version = find_distribution_version(*distribution_names)
    print(f"{module_name}: version={version}, path={getattr(module, '__file__', '<built-in>')}")
    return module


def find_distribution_version(*distribution_names: str) -> str:
    for name in distribution_names:
        try:
            return importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            continue
    return "unknown"


def check_libusb_backend() -> int:
    print_header("PyUSB libusb backend")
    libusb_path = ctypes.util.find_library("libusb-1.0")
    print(f'ctypes.util.find_library("libusb-1.0"): {libusb_path!r}')

    try:
        libusb1 = importlib.import_module("usb.backend.libusb1")
        backend = libusb1.get_backend()
    except Exception as exc:
        print_classified_failure("libusb backend check failed", exc)
        print_windows_next_steps(missing_backend=True)
        return MISSING_LIBUSB_BACKEND

    print(f"usb.backend.libusb1.get_backend(): {backend!r}")
    if backend is None:
        print("classification: missing libusb backend")
        print_windows_next_steps(missing_backend=True)
        return MISSING_LIBUSB_BACKEND

    return SUCCESS


def detect_available_configs(can_module: ModuleType) -> None:
    print_header('can.detect_available_configs(["gs_usb"])')
    try:
        configs = can_module.detect_available_configs(["gs_usb"])
    except Exception as exc:
        print_classified_failure("detect_available_configs failed", exc)
        return

    if configs:
        print(f"detected configs: {configs!r}")
    else:
        print("detected configs: []")


def open_gs_usb_bus(can_module: ModuleType) -> int:
    print_header('can.Bus(interface="gs_usb", channel=0, bitrate=500000)')
    bus: Any | None = None
    logging.getLogger("can").setLevel(logging.ERROR)
    try:
        bus = can_module.Bus(interface="gs_usb", channel=0, bitrate=500000)
    except Exception as exc:
        return classify_open_failure(exc)

    print("SUCCESS: opened GS_USB bus on channel=0 bitrate=500000")
    try:
        bus.shutdown()
        print("shutdown: clean")
    except Exception as exc:
        print_classified_failure("shutdown failed", exc)
        return UNKNOWN_FAILURE
    return SUCCESS


def classify_open_failure(exc: Exception) -> int:
    if is_no_backend_error(exc):
        print_classified_failure("missing libusb backend", exc)
        print_windows_next_steps(missing_backend=True)
        return MISSING_LIBUSB_BACKEND

    message = exception_text(exc).lower()
    if contains_any(message, "access denied", "permission", "libusb_error_access", "claim"):
        print_classified_failure("permission/access denied", exc)
        print_windows_next_steps(permission_failure=True)
        return ACCESS_DENIED

    if contains_any(message, "not found", "no device", "cannot find", "no gs_usb"):
        print_classified_failure("no GS_USB device detected/found", exc)
        print_windows_next_steps()
        return NO_DEVICE_FOUND

    if contains_any(message, "no module named", "unknown interface", "gs_usb"):
        print_classified_failure("missing gs_usb/python-can dependency", exc)
        print_windows_next_steps()
        return UNKNOWN_FAILURE

    print_classified_failure("unknown exception", exc)
    print_windows_next_steps()
    return UNKNOWN_FAILURE


def is_no_backend_error(exc: Exception) -> bool:
    try:
        usb_core = importlib.import_module("usb.core")
        no_backend_error = getattr(usb_core, "NoBackendError")
    except Exception:
        return "nobackenderror" in exception_text(exc).lower()
    return isinstance(exc, no_backend_error)


def print_classified_failure(classification: str, exc: Exception) -> None:
    print(f"classification: {classification}")
    print(f"exception: {type(exc).__module__}.{type(exc).__name__}: {exc}")
    if "--traceback" in sys.argv:
        traceback.print_exception(exc)


def print_missing_dependency(package_name: str) -> None:
    print(f"classification: missing {package_name} dependency")
    print(f"next step: install {package_name} in this Python environment")


def print_windows_next_steps(
    *, missing_backend: bool = False, permission_failure: bool = False
) -> None:
    print()
    print("Windows next steps:")
    if missing_backend:
        print("- Install or copy libusb-1.0.dll for the same architecture as Python.")
        print("- Ensure libusb-1.0.dll is on PATH or beside python.exe.")
        print("- Re-run this probe before changing USB drivers with Zadig.")
    elif permission_failure:
        print("- The libusb backend exists, so check the adapter driver binding.")
        print("- Use Zadig/WinUSB only when backend exists but device access fails.")
    else:
        print("- Confirm the GS_USB/candleLight adapter is plugged in and enumerates.")
        print("- Ensure libusb-1.0.dll is on PATH or beside python.exe.")
        print("- Use Zadig/WinUSB only if backend exists but permission fails.")


def exception_text(exc: Exception) -> str:
    return "\n".join(str(arg) for arg in exc.args) or str(exc)


def contains_any(message: str, *needles: str) -> bool:
    return any(needle in message for needle in needles)


if __name__ == "__main__":
    raise SystemExit(main())
