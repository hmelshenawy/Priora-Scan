import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tests.fixtures.frames import DETERMINISTIC_FRAMES


@pytest.fixture
def deterministic_frames():
    return list(DETERMINISTIC_FRAMES)
