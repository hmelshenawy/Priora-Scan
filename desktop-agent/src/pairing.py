from src.api_client import ApiClient
from src.config import AGENT_VERSION


def exchange_pairing_token(
    api_client: ApiClient, pairing_token: str, agent_name: str
) -> dict:
    response = api_client.post(
        "/obd/agents/register",
        json={
            "pairingToken": pairing_token,
            "agentName": agent_name,
            "version": AGENT_VERSION,
        },
    )
    data = response.json()
    api_client.set_agent_token(data["agentId"], data["accessToken"])
    return data
