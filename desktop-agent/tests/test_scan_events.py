from unittest.mock import patch

from src.agent.bootstrap import ensure_adapter_connected
from src.agent.scan_executor import execute_scan
from src.models.fault_code import FaultCode
from src.models.scan_job import ScanJob
from src.obd.commands.vin import VinResult


class ConnectedAdapter:
    protocol = "MOCK"

    def is_connected(self):
        return True


class DisconnectedAdapter:
    protocol = "MOCK"

    def is_connected(self):
        return False


class ConnectableAdapter:
    protocol = "MOCK"

    def __init__(self):
        self.connect_calls = 0
        self.connected = False

    def is_connected(self):
        return self.connected

    def connect(self):
        self.connect_calls += 1
        self.connected = True
        return True


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
        patch("src.agent.scan_executor.read_vin", return_value=VinResult.supported("WDD2130041A123456")),
        patch(
            "src.agent.scan_executor.read_fault_codes",
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
        patch("src.agent.scan_executor.read_vin", return_value=VinResult.supported("WDD2130041A123456")),
        patch("src.agent.scan_executor.read_fault_codes") as read_fault_codes,
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
        patch("src.agent.scan_executor.read_vin") as read_vin,
        patch(
            "src.agent.scan_executor.read_fault_codes",
            return_value=[FaultCode("P0301", status="ACTIVE", ecu="ECM")],
        ),
    ):
        execute_scan(client, ConnectedAdapter(), job)

    read_vin.assert_not_called()
    assert [post[1]["event"] for post in client.posts] == [
        "ADAPTER_CONNECTED",
        "DTC_READ",
    ]


def test_execute_scan_skips_vin_for_confirmed_no_vin_job():
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
        vehicle_id="vehicle-123",
    )

    with (
        patch("src.agent.scan_executor.read_vin") as read_vin,
        patch(
            "src.agent.scan_executor.read_fault_codes",
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


def test_ensure_adapter_connected_calls_connect_when_needed():
    adapter = ConnectableAdapter()

    assert ensure_adapter_connected(adapter) is True
    assert adapter.connect_calls == 1
    assert adapter.is_connected() is True


def test_execute_scan_connects_adapter_before_reading():
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
    adapter = ConnectableAdapter()

    with patch(
        "src.agent.scan_executor.read_fault_codes",
        return_value=[FaultCode("P0301", status="ACTIVE", ecu="ECM")],
    ):
        execute_scan(client, adapter, job)

    assert adapter.connect_calls == 1
    assert [post[1]["event"] for post in client.posts] == [
        "ADAPTER_CONNECTED",
        "DTC_READ",
    ]


def test_execute_scan_continues_when_vin_unsupported():
    """execute_scan continues to DTC read when VIN is unsupported."""
    client = Client(
        responses=[
            Response({"status": "OK"}),
            Response({"status": "COMPLETED"}),
        ],
    )
    job = ScanJob("scan-123", "RUNNING", "2026-06-09T00:00:00Z")

    with (
        patch("src.agent.scan_executor.read_vin", return_value=VinResult.unsupported("ALL_FF")),
        patch(
            "src.agent.scan_executor.read_fault_codes",
            return_value=[FaultCode("P0301", status="ACTIVE", ecu="ECM")],
        ),
    ):
        execute_scan(client, ConnectedAdapter(), job)

    # Should have 3 events: ADAPTER_CONNECTED, VIN_READ (unsupported), DTC_READ
    assert len(client.posts) == 3
    assert "VIN_READ_FAILED" not in [post[1]["event"] for post in client.posts]
    assert client.posts[1][1]["event"] == "VIN_READ"
    assert client.posts[1][1]["payload"]["vin"] is None
    assert client.posts[1][1]["payload"]["supported"] is False
    assert client.posts[1][1]["payload"]["vinStatus"] == "UNSUPPORTED"
    assert client.posts[1][1]["payload"]["reason"] == "ALL_FF"
    assert client.posts[2][1]["event"] == "DTC_READ"


def test_toyota_real_faults_scan_maps_unsupported_vin_to_non_failure_event():
    """toyota_real_faults has an unsupported VIN but still reads DTCs."""
    from src.obd.mock_adapter import MockObdAdapter

    client = Client(
        responses=[
            Response({"status": "OK"}),
            Response({"status": "RUNNING"}),
            Response({"status": "COMPLETED"}),
        ],
    )
    job = ScanJob("scan-123", "RUNNING", "2026-06-09T00:00:00Z")

    execute_scan(client, MockObdAdapter(profile_name="toyota_real_faults"), job)

    events = [post[1]["event"] for post in client.posts]
    assert events == ["ADAPTER_CONNECTED", "VIN_READ", "DTC_READ"]
    assert "VIN_READ_FAILED" not in events

    vin_payload = client.posts[1][1]["payload"]
    assert vin_payload == {
        "vin": None,
        "supported": False,
        "vinStatus": "UNSUPPORTED",
        "reason": "ALL_FF",
    }
    assert "FFFFFFFFFFFFFFFFF" not in str(vin_payload)

    dtc_payload = client.posts[2][1]["payload"]
    assert [code["code"] for code in dtc_payload["codes"]]


def test_execute_vehicle_data_read_continues_when_vin_unsupported():
    """execute_vehicle_data_read completes when VIN is unsupported."""
    from src.main import execute_vehicle_data_read

    client = Client(
        responses=[
            Response({"status": "OK"}),
        ],
    )

    class MockAdapterWithVIN:
        protocol = "MOCK"
        adapter_type = "MOCK"

        def send(self, cmd):
            # Return minimal valid responses for health PIDs
            responses = {
                "0104": b"410480",
                "0142": b"414236D4",
            }
            return responses.get(cmd, b"")

        def connect(self):
            return True

        def is_connected(self):
            return True

    with patch("src.agent.scan_executor.read_vin", return_value=VinResult.unsupported("ALL_FF")), \
         patch("src.agent.scan_executor.read_vehicle_health", return_value={
             "rpm": {"pid": "0C", "value": None, "unit": "RPM", "supported": False, "available": False, "rawResponse": None},
             "vehicleSpeed": {"pid": "0D", "value": None, "unit": "km/h", "supported": False, "available": False, "rawResponse": None},
             "coolantTemperature": {"pid": "05", "value": None, "unit": "°C", "supported": False, "available": False, "rawResponse": None},
             "batteryVoltage": {"pid": "42", "value": 14.036, "unit": "V", "supported": True, "available": True, "rawResponse": "414236D4"},
             "calculatedEngineLoad": {"pid": "04", "value": 50.0, "unit": "%", "supported": True, "available": True, "rawResponse": "410480"},
             "fuelLevel": {"pid": "2F", "value": None, "unit": "%", "supported": False, "available": False, "rawResponse": None},
             "supportedHealthPids": ["04", "42"],
             "unsupportedHealthPids": ["05", "0C", "0D", "2F"],
         }), \
         patch("src.agent.scan_executor.read_fuel_system_status", return_value={"value": "Closed Loop", "supported": True}), \
         patch("src.agent.scan_executor.read_readiness_monitors", return_value={"supported": True, "value": {}}), \
         patch("src.agent.scan_executor.read_supported_pids", return_value={"01": [], "09": []}), \
         patch("src.agent.scan_executor.read_mileage", return_value={"value": None, "unit": "km", "supported": False}):
        execute_vehicle_data_read(client, "session-1", MockAdapterWithVIN())

    # Should have VEHICLE_DATA_READ event
    assert len(client.posts) == 1
    event = client.posts[0]
    assert event[1]["event"] == "VEHICLE_DATA_READ"
    vehicle_data = event[1]["payload"]["vehicleData"]
    assert vehicle_data["vin"]["supported"] is False
    assert vehicle_data["vin"]["value"] is None
    assert vehicle_data["vin"]["reason"] == "ALL_FF"
