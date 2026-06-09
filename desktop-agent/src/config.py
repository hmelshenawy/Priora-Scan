import os
from dotenv import load_dotenv

load_dotenv()

PRIORASCAN_API_URL = os.getenv("PRIORASCAN_API_URL", "http://localhost:3000")
AGENT_VERSION = "1.0.0"
HEARTBEAT_INTERVAL_SECONDS = 30
SCAN_QUEUE_INTERVAL_SECONDS = 2
