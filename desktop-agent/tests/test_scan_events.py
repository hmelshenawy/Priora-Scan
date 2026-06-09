from unittest.mock import patch

from src.main import execute_scan
from src.models.fault_code import FaultCode
from src.models.scan_job import ScanJob


class ConnectedAdapter:
    protocol = "MOCK"

    def is_connected(self):
        return True


class DisconnectedAdapter:
    protocol = "MOCK"

    def is_connected(self):
        return False


class Client:
    agent_id = "agent-123"

    def __init__(self, responses=None):
        self.responses = responses or []
        self.posts = []

    def post(self, path, json=None):
        self.posts.append((path, json))
        if self.responses:
            return self.responses.pop(0)
        return None


class Response:
    def __init__(self, data):
        self.data = data

    def json(self):
        return self.data


def test_execute_scan_emits_backend_scan_event_contract():
    client = Client(
        responses=[
            Response({"status": "OK"}),
            Response({"status": "RUNNING"}),
            Response({"status": "COMPLETED"}),
        ],
    )
    job = ScanJob("scan-123", "RUNNING", "2026-06-09T00:00:00Z")

    with (
        patch("src.main.read_vin", return_value="WDD2130041A123456"),
        patch(
            "src.main.read_fault_codes",
            return_value=[
                FaultCode("P0301", status="ACTIVE", ecu="ECM"),
                FaultCode("P0171", status="PENDING", ecu="ECM"),
            ],
        ),
    ):
        execute_scan(client, ConnectedAdapter(), job)

    assert client.posts == [
        (
            "/obd/agents/agent-123/scan-events",
            {
                "scanJobId": "scan-123",
                "event": "ADAPTER_CONNECTED",
                "payload": {"protocol": "MOCK"},
            },
        ),
        (
            "/obd/agents/agent-123/scan-events",
            {
                "scanJobId": "scan-123",
                "event": "VIN_READ",
                "payload": {"vin": "WDD2130041A123456"},
            },
        ),
        (
            "/obd/agents/agent-123/scan-events",
            {
                "scanJobId": "scan-123",
                "event": "DTC_READ",
                "payload": {
                    "codes": [
                        {
                            "code": "P0301",
                            "permanent": False,
                            "status": "ACTIVE",
                            "ecu": "ECM",
                        },
                        {
                            "code": "P0171",
                            "permanent": False,
                            "status": "PENDING",
                            "ecu": "ECM",
                        },
                    ],
                },
            },
        ),
    ]


def test_execute_scan_stops_when_vehicle_confirmation_required(capsys):
    client = Client(
        responses=[
            Response({"status": "OK"}),
            Response({"status": "NEEDS_VEHICLE_CONFIRMATION"}),
        ],
    )
    job = ScanJob("scan-123", "RUNNING", "2026-06-09T00:00:00Z")

    with (
        patch("src.main.read_vin", return_value="WDD2130041A123456"),
        patch("src.main.read_fault_codes") as read_fault_codes,
    ):
        execute_scan(client, ConnectedAdapter(), job)

    read_fault_codes.assert_not_called()
    assert len(client.posts) == 2
    assert client.posts[1][1] == {
        "scanJobId": "scan-123",
        "event": "VIN_READ",
        "payload": {"vin": "WDD2130041A123456"},
    }
    assert "Vehicle confirmation required" in capsys.readouterr().out


def test_execute_scan_skips_vin_for_confirmed_job():
    client = Client(
        responses=[
            Response({"status": "OK"}),
            Response({"status": "COMPLETED"}),
        ],
    )
    job = ScanJob(
        "scan-123",
        "RUNNING",
        "2026-06-09T00:00:00Z",
        vin="WDD2130041A123456",
    )

    with (
        patch("src.main.read_vin") as read_vin,
        patch(
            "src.main.read_fault_codes",
            return_value=[FaultCode("P0301", status="ACTIVE", ecu="ECM")],
        ),
    ):
        execute_scan(client, ConnectedAdapter(), job)

    read_vin.assert_not_called()
    assert [post[1]["event"] for post in client.posts] == [
        "ADAPTER_CONNECTED",
        "DTC_READ",
    ]


def test_execute_scan_emits_error_when_adapter_disconnected():
    client = Client()
    job = ScanJob("scan-123", "RUNNING", "2026-06-09T00:00:00Z")

    execute_scan(client, DisconnectedAdapter(), job)

    assert client.posts == [
        (
            "/obd/agents/agent-123/scan-events",
            {
                "scanJobId": "scan-123",
                "event": "ERROR",
                "payload": {"message": "No adapter connected"},
            },
        ),
    ]
