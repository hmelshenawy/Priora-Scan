# Quickstart: CAN Sniffer MVP (Feature 021)

**Branch**: `021-can-sniffer-mvp` | **Date**: 2026-06-30 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

This quickstart shows how to capture raw Classic CAN frames with the `prioracan` sniffer. It requires **no hardware** for the mock path. The `CaptureSession` object is the single lifecycle owner: you construct it, `start()` it, and `stop()` it (or use it as a context manager). Statistics are returned on stop.

> Install (once): `pip install -e can_usb_adapter[dev]` from the repo root.

---

## 1. Mock capture (no hardware)

The fastest way to try the sniffer. The `MockDriver` replays a deterministic frame list and ends cleanly when exhausted.

```python
import time

from prioracan import CaptureSession, CanUsbConfig, MockDriver, JsonlLogger
from prioracan.frame import CanFrame, Direction

frames = [
    CanFrame(0.000, 0, Direction.RX, 0x100, False, False, False, 1, b"\x11"),
    CanFrame(0.010, 0, Direction.RX, 0x200, False, False, False, 2, b"\x22\x33"),
    CanFrame(0.020, 0, Direction.RX, 0x300, True,  False, False, 3, b"\x44\x55\x66"),
]

driver = MockDriver(frames)
config = CanUsbConfig()
logger = JsonlLogger("capture.jsonl")

session = CaptureSession("demo-1", time.monotonic(), driver, config, loggers=[logger])
session.start()
stats = session.stop()

print(f"total frames : {stats.total_frames}")
print(f"rx / tx      : {stats.rx_frames} / {stats.tx_frames}")
print(f"duration     : {stats.duration:.3f} s")
print(f"avg rate     : {stats.average_frame_rate:.1f} fps")
print(f"dropped      : {stats.dropped_frames}")
```

**Expected output** (deterministic counts; timings vary):

```text
total frames : 3
rx / tx      : 3 / 0
duration     : 0.001 s
avg rate     : 3000.0 fps
dropped      : 0
```

`capture.jsonl` now contains three valid JSON records, one per frame, with `arbitration_id`, `arbitration_id_hex`, `dlc`, `data_hex`, `direction`, `timestamp`, `channel`, and flags.

---

## 2. Context-managed lifecycle (automatic cleanup)

Use `CaptureSession` as a context manager so cleanup always runs — even if you forget to call `stop()` or the process is interrupted.

```python
with CaptureSession("demo-2", time.monotonic(), MockDriver(frames), CanUsbConfig()) as session:
    session.start()
    # capture runs to mock exhaustion here
# stop() ran automatically on __exit__
print(session.statistics.total_frames)
```

---

## 3. No-logger capture (logging is optional)

```python
session = CaptureSession("demo-3", time.monotonic(), MockDriver(frames), CanUsbConfig())
session.start()
stats = session.stop()
assert stats.total_frames == 3   # frames counted even with no logger
```

---

## 4. Multiple loggers (JSONL + ASC)

```python
from prioracan import AscLogger

session = CaptureSession(
    "demo-4",
    time.monotonic(),
    MockDriver(frames),
    CanUsbConfig(),
    loggers=[JsonlLogger("capture.jsonl"), AscLogger("capture.asc")],
)
session.start()
session.stop()
```

Each logger receives one record per frame.

---

## 5. GS_USB capture (real hardware)

Live capture from a GS_USB / candleLight adapter for a configurable duration. Requires a connected adapter (and OS setup — see Troubleshooting).

```python
import time

from prioracan import CaptureSession, CanUsbConfig, GsUsbDriver, JsonlLogger

config = CanUsbConfig(interface="gs_usb", channel=0, bitrate=500000)
driver = GsUsbDriver(config)
logger = JsonlLogger("live.jsonl")

duration_seconds = 5.0
session = CaptureSession("live-1", time.monotonic(), driver, config, loggers=[logger])

session.start()
# Stop after the configured duration (from a helper thread or a timer).
# In the example script this is handled by capture_gs_usb.py --duration.
time.sleep(duration_seconds)
stats = session.stop()

print(f"captured {stats.total_frames} frames in {stats.duration:.2f}s "
      f"({stats.average_frame_rate:.1f} fps)")
```

The shipped `examples/capture_gs_usb.py` wraps this with a CLI `--duration` argument and a helper-thread stop so `stop()` is bounded and deterministic.

---

## 6. Lifecycle at a glance

```text
Created ──start()──► Starting ──► Running ──stop()/disconnect/logger-fail/interrupt──► Stopping ──► Stopped ──__exit__──► Disposed
```

- `stop()` before `start()` → safe no-op, returns zero statistics.
- `stop()` is idempotent (calling twice is safe).
- `start()` twice on the same instance → `CanAdapterError`. Create a new `CaptureSession` for the next capture.
- `DISPOSED` is reached only by exiting the context manager (`__exit__`); there is no public `dispose()` method. Any operation on a disposed session raises `CanAdapterError`.
- On any failure (missing device, permission, logger error, disconnect) a `CanAdapterError` subclass is raised and cleanup runs — never a raw `python-can`/libusb exception.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `CanDeviceNotFoundError` on `start()` | No GS_USB adapter plugged in / not enumerated | Plug in the adapter; check it appears in the OS. |
| `CanPermissionError` on Windows | Wrong USB driver (candleLight needs WinUSB/libusb) | Re-bind the adapter to WinUSB via Zadig (winusb). |
| `CanPermissionError` on Linux | `udev` rules / no access to the USB device | Install `udev` rules for the adapter; add your user to the `plugdev`/`dialout` group; re-plug. |
| `CanConfigurationError` | Bad bitrate/channel/timeout | Check `CanUsbConfig` values (bitrate > 0, timeout >= 0). |
| `CanLoggingError` | Logger path not writable / disk full | Use a writable `log_directory`; free space. The session stops gracefully with partial statistics. |
| Capture ends immediately on GS_USB | (Pre-refinement) empty-bus timeout ended the loop | After Feature 021, `iter_frames` continues across empty-bus timeouts until `stop()`. If you still see this, ensure you are on the Feature 021 build. |
| `CanAdapterError` on `start()` (already started/stopped) | The session was already started or stopped | `CaptureSession` is single-use; create a new instance for each capture. |
| High `dropped_frames` | Consumer cannot keep up; backpressure | Reduce logging overhead or run on a faster host; dropped frames are reported where detectable. |

---

## 8. What this feature does NOT do

- No transmission (receive-only).
- No CAN FD (Classic CAN, 0–8 byte payloads, only).
- No ISO-TP, UDS, DBC decoding.
- No replay, no frame filtering, no bus statistics.
- No Desktop Agent / PrioraScan backend / frontend integration.

Those are future features that will **consume frames from `CaptureSession`** without extending its responsibilities.