import os
from pathlib import Path
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(ENV_PATH)

PRIORASCAN_API_URL = os.getenv("PRIORASCAN_API_URL", "http://localhost:3101")
API_TIMEOUT_SECONDS = float(os.getenv("API_TIMEOUT_SECONDS", "10"))
AGENT_ID = os.getenv("AGENT_ID")
AGENT_ACCESS_TOKEN = os.getenv("AGENT_ACCESS_TOKEN")
AGENT_NAME = os.getenv("AGENT_NAME", "Desktop Agent")
AGENT_VERSION = os.getenv("AGENT_VERSION", "1.0.0")
OBD_MOCK = os.getenv("OBD_MOCK", "").lower() == "true"
HEARTBEAT_INTERVAL_SECONDS = 30
SCAN_QUEUE_INTERVAL_SECONDS = 2
