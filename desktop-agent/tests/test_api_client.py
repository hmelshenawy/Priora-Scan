import pytest
from unittest.mock import patch, MagicMock

from src.api_client import ApiClient


class TestApiClientHeaders:
    def test_headers_without_token(self):
        client = ApiClient()
        headers = client._headers()
        assert headers == {"Content-Type": "application/json"}
        assert "X-Agent-Token" not in headers

    def test_headers_with_token(self):
        client = ApiClient()
        client.set_agent_token("agent-123", "secret-token")
        headers = client._headers()
        assert headers["Content-Type"] == "application/json"
        assert headers["X-Agent-Token"] == "secret-token"

    def test_post_injects_x_agent_token(self):
        client = ApiClient()
        client.set_agent_token("agent-123", "my-token")

        with patch("src.api_client.httpx.request") as mock_request:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.raise_for_status = MagicMock()
            mock_request.return_value = mock_response

            client.post("/obd/agents/agent-123/heartbeat", json={"version": "1.0"})

            call_kwargs = mock_request.call_args[1]
            assert call_kwargs["headers"]["X-Agent-Token"] == "my-token"

    def test_get_injects_x_agent_token(self):
        client = ApiClient()
        client.set_agent_token("agent-123", "my-token")

        with patch("src.api_client.httpx.request") as mock_request:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.raise_for_status = MagicMock()
            mock_request.return_value = mock_response

            client.get("/obd/agents/agent-123/scan-queue")

            call_kwargs = mock_request.call_args[1]
            assert call_kwargs["headers"]["X-Agent-Token"] == "my-token"

    def test_request_retries_on_500(self):
        import httpx
        client = ApiClient()

        with patch("src.api_client.httpx.request") as mock_request:
            # First two calls fail with 500, third succeeds
            fail_response = MagicMock()
            fail_response.status_code = 500
            fail_response.raise_for_status.side_effect = httpx.HTTPStatusError(
                "Server Error",
                request=MagicMock(),
                response=fail_response,
            )

            ok_response = MagicMock()
            ok_response.status_code = 200
            ok_response.raise_for_status = MagicMock()

            mock_request.side_effect = [fail_response, fail_response, ok_response]

            result = client.get("/health")
            assert result == ok_response
            assert mock_request.call_count == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
