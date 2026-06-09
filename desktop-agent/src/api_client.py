import time
import httpx
from src.config import PRIORASCAN_API_URL

class ApiClient:
    def __init__(self):
        self.base_url = PRIORASCAN_API_URL.rstrip("/")
        self.agent_token = None
        self.agent_id = None

    def set_agent_token(self, agent_id: str, token: str):
        self.agent_id = agent_id
        self.agent_token = token

    def _headers(self):
        headers = {"Content-Type": "application/json"}
        if self.agent_token:
            headers["X-Agent-Token"] = self.agent_token
        return headers

    def _request(self, method: str, path: str, **kwargs):
        url = f"{self.base_url}{path}"
        retries = 3
        for attempt in range(retries):
            try:
                response = httpx.request(
                    method, url, headers=self._headers(), timeout=30, **kwargs
                )
                if response.status_code == 429:
                    time.sleep(2 ** attempt)
                    continue
                response.raise_for_status()
                return response
            except httpx.HTTPStatusError as e:
                if e.response.status_code >= 500 and attempt < retries - 1:
                    time.sleep(1)
                    continue
                print(
                    f"HTTP {e.response.status_code} {method} {url}: "
                    f"{e.response.text}"
                )
                raise
            except httpx.RequestError:
                if attempt < retries - 1:
                    time.sleep(1)
                    continue
                raise
        return None

    def post(self, path: str, json=None):
        return self._request("POST", path, json=json)

    def get(self, path: str):
        return self._request("GET", path)
