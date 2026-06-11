"""Live data MVP module for the PrioraScan Desktop Agent.

Feature 006 — Phase B.2 thin vertical slice.

Provides:

* :class:`MockLiveDataGenerator` — deterministic mock raw-byte values
  for the six MVP PIDs. RPM changes slightly each tick; speed stays
  at 0; the rest hold stable mid-range values.
* :class:`LiveDataPoller` — owns the background thread that calls
  the generator on a configurable cadence and POSTs the readings
  to the backend.
* :func:`poll_live_data_command_queue` — entry point the agent's
  main loop calls to drain pending LIVE_DATA_POLL / LIVE_DATA_STOP
  commands.
"""

from src.live_data.generator import MockLiveDataGenerator
from src.live_data.poller import LiveDataPoller
from src.live_data.queue import poll_live_data_command_queue

__all__ = [
    "MockLiveDataGenerator",
    "LiveDataPoller",
    "poll_live_data_command_queue",
]
