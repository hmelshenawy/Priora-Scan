"""Supported PID discovery for standard OBD-II modes."""

from __future__ import annotations

from typing import Dict

from src.obd.adapter import BaseAdapter
from src.obd.commands.health_pids import _debug, _parse_bytes, _send_pid


def _parse_bitmap(hex_str: str, prefix: str, base_offset: int) -> tuple[list[str], bool]:
    _debug(
        f"bitmap start prefix={prefix} base_offset=0x{base_offset:02X} response={hex_str!r}"
    )
    if not hex_str or not hex_str.startswith(prefix):
        _debug(f"bitmap reject prefix={prefix} response={hex_str!r}")
        return [], False
    try:
        bytes_ = _parse_bytes(hex_str, len(prefix))
        if len(bytes_) < 4:
            _debug(f"bitmap reject prefix={prefix} reason=short bytes={bytes_!r}")
            return [], False
        bitmask = (bytes_[0] << 24) | (bytes_[1] << 16) | (bytes_[2] << 8) | bytes_[3]
        pids: list[str] = []
        for bit in range(32):
            if bitmask & (1 << (31 - bit)):
                pids.append(f"{base_offset + bit + 1:02X}")
        chain_continues = bool(bitmask & 1)
        _debug(
            f"bitmap parsed prefix={prefix} bitmask=0x{bitmask:08X} pids={pids!r} chain={chain_continues}"
        )
        return pids, chain_continues
    except (ValueError, IndexError) as exc:
        _debug(f"bitmap failed prefix={prefix} response={hex_str!r} error={exc}")
        return [], False


def read_supported_pids(adapter: BaseAdapter) -> Dict[str, list[str]]:
    _debug("read_supported_pids start")
    supported: Dict[str, list[str]] = {"01": [], "09": []}

    chain_map = {
        "00": 0x00,
        "20": 0x20,
        "40": 0x40,
        "60": 0x60,
        "80": 0x80,
        "A0": 0xA0,
        "C0": 0xC0,
    }

    next_pid = "00"
    while next_pid in chain_map:
        prefix = f"41{next_pid}"
        base_offset = chain_map[next_pid]
        hex_str = _send_pid(adapter, "01", next_pid)
        pids, chain_continues = _parse_bitmap(hex_str, prefix, base_offset)
        supported["01"].extend(pids)
        _debug(
            f"read_supported_pids mode01 pid={next_pid} response={hex_str!r} pids={pids!r} chain={chain_continues}"
        )
        if not chain_continues:
            break
        next_offset = int(next_pid, 16) + 0x20
        next_pid = f"{next_offset:02X}"

    hex_str_09 = _send_pid(adapter, "09", "00")
    _debug(f"read_supported_pids mode09 response={hex_str_09!r}")
    if hex_str_09 and hex_str_09.startswith("4900"):
        try:
            bytes_ = _parse_bytes(hex_str_09, 4)
            bitmask = (bytes_[0] << 24) | (bytes_[1] << 16) | (bytes_[2] << 8) | bytes_[3]
            if bitmask & (1 << (31 - 1)):
                supported["09"].append("02")
            _debug(f"read_supported_pids mode09 bitmask=0x{bitmask:08X} supported={supported['09']!r}")
        except (ValueError, IndexError) as exc:
            _debug(f"read_supported_pids mode09 parse failed response={hex_str_09!r} error={exc}")

    _debug(f"read_supported_pids result={supported!r}")
    return supported
