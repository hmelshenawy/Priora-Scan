from src.api_client import ApiClient


def emit_scan_event(api_client: ApiClient, scan_id: str, event_type: str, data: dict) -> dict | None:
    print(f"Scan event {event_type}: {data}")
    response = api_client.post(
        f"/obd/agents/{api_client.agent_id}/scan-events",
        json={"scanJobId": scan_id, "event": event_type, "payload": data},
    )
    return response.json() if response else None


def emit_session_event(
    api_client: ApiClient, session_id: str, event_type: str, data: dict
) -> dict | None:
    response = api_client.post(
        f"/obd/agents/{api_client.agent_id}/scan-events",
        json={"sessionId": session_id, "event": event_type, "payload": data},
    )
    return response.json() if response else None
