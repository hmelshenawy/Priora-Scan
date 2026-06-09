import os
from dotenv import set_key

from src.api_client import ApiClient
from src.config import AGENT_VERSION, ENV_PATH


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
    save_agent_credentials(data["agentId"], data["accessToken"])
    return data


def save_agent_credentials(agent_id: str, access_token: str) -> None:
    ENV_PATH.touch(exist_ok=True)
    set_key(str(ENV_PATH), "AGENT_ID", agent_id, quote_mode="never")
    set_key(str(ENV_PATH), "AGENT_ACCESS_TOKEN", access_token, quote_mode="never")
    os.environ["AGENT_ID"] = agent_id
    os.environ["AGENT_ACCESS_TOKEN"] = access_token
    print("Saved agent token")
