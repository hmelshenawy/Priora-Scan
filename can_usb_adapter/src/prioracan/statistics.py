from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CaptureStatistics:
    """Bounded per-capture counters returned by CaptureSession.

    Fields are start_time, end_time, duration, total_frames, rx_frames,
    tx_frames, dropped_frames, and average_frame_rate.
    """

    start_time: float
    end_time: float
    duration: float
    total_frames: int
    rx_frames: int
    tx_frames: int
    dropped_frames: int
    average_frame_rate: float

    @classmethod
    def build(
        cls,
        start_time: float,
        end_time: float,
        *,
        total_frames: int,
        rx_frames: int,
        tx_frames: int,
        dropped_frames: int = 0,
    ) -> CaptureStatistics:
        duration = end_time - start_time
        rate = total_frames / duration if duration > 0 else 0.0
        return cls(
            start_time=start_time,
            end_time=end_time,
            duration=duration,
            total_frames=total_frames,
            rx_frames=rx_frames,
            tx_frames=tx_frames,
            dropped_frames=dropped_frames,
            average_frame_rate=rate,
        )
