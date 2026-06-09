from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from src.api_client import ApiClient
from src.pairing import exchange_pairing_token, save_agent_credentials


def test_save_agent_credentials_writes_env_file(tmp_path, monkeypatch, capsys):
    env_path = tmp_path / ".env"
    env_path.write_text("PRIORASCAN_API_URL=http://localhost:3101\n", encoding="utf-8")
    monkeypatch.setattr("src.pairing.ENV_PATH", env_path)

    save_agent_credentials("agent-123", "token-abc")

    assert "AGENT_ID=agent-123" in env_path.read_text(encoding="utf-8")
    assert "AGENT_ACCESS_TOKEN=token-abc" in env_path.read_text(encoding="utf-8")
    assert "Saved agent token" in capsys.readouterr().out


def test_exchange_pairing_token_sets_and_persists_agent_token(monkeypatch):
    client = ApiClient()
    response = MagicMock()
    response.json.return_value = {
        "agentId": "agent-123",
        "accessToken": "token-abc",
    }
    monkeypatch.setattr(client, "post", MagicMock(return_value=response))

    with patch("src.pairing.save_agent_credentials") as save_credentials:
        data = exchange_pairing_token(client, "PAIR-TOKEN", "Agent Name")

    assert data["agentId"] == "agent-123"
    assert client.agent_id == "agent-123"
    assert client.agent_token == "token-abc"
    save_credentials.assert_called_once_with("agent-123", "token-abc")


def test_configure_agent_auth_uses_saved_token(monkeypatch, capsys):
    import src.main as main

    client = ApiClient()
    monkeypatch.setattr(main, "AGENT_ID", "agent-123")
    monkeypatch.setattr(main, "AGENT_ACCESS_TOKEN", "token-abc")

    main.configure_agent_auth(client, SimpleNamespace(pairing_token=None, name="Agent"))

    assert client.agent_id == "agent-123"
    assert client.agent_token == "token-abc"
    assert "Using saved agent token" in capsys.readouterr().out


def test_configure_agent_auth_requires_pairing_token_when_unsaved(monkeypatch, capsys):
    import src.main as main

    client = ApiClient()
    monkeypatch.setattr(main, "AGENT_ID", None)
    monkeypatch.setattr(main, "AGENT_ACCESS_TOKEN", None)

    with pytest.raises(SystemExit, match="--pairing-token is required"):
        main.configure_agent_auth(
            client,
            SimpleNamespace(pairing_token=None, name="Agent"),
        )

    assert "No saved token found; pairing token required" in capsys.readouterr().out


def test_configure_agent_auth_pairs_when_no_saved_token(monkeypatch, capsys):
    import src.main as main

    client = ApiClient()
    monkeypatch.setattr(main, "AGENT_ID", None)
    monkeypatch.setattr(main, "AGENT_ACCESS_TOKEN", None)

    def fake_exchange(api_client, pairing_token, agent_name):
        api_client.set_agent_token("agent-123", "token-abc")
        return {"agentId": "agent-123", "accessToken": "token-abc"}

    monkeypatch.setattr(main, "exchange_pairing_token", fake_exchange)

    main.configure_agent_auth(
        client,
        SimpleNamespace(pairing_token="PAIR-TOKEN", name="Agent"),
    )

    assert client.agent_id == "agent-123"
    assert client.agent_token == "token-abc"
    output = capsys.readouterr().out
    assert "No saved token found; pairing token required" in output
    assert "Paired agent: agent-123" in output
