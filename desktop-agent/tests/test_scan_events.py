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


def test_execute_scan_runs_control_unit_discovery_after_vin_when_session_is_created():
    client = Client(
        responses=[
            Response({"status": "OK"}),
            Response({"status": "RUNNING", "sessionId": "session-from-vin"}),
            Response({"status": "OK"}),
            Response({"status": "COMPLETED"}),
        ],
    )
    job = ScanJob("scan-123", "RUNNING", "2026-06-09T00:00:00Z")
    discovery_result = {
        "version": 1,
        "strategy": "GENERIC_OBD_CAN",
        "scanMode": "FUNCTIONAL_THEN_PHYSICAL",
        "probeSequence": ["22F190"],
        "startedAt": "2026-06-15T12:00:00+00:00",
        "completedAt": "2026-06-15T12:00:01+00:00",
        "summary": {
            "totalProbes": 1,
            "respondersFound": 1,
            "functionalResponders": 1,
            "physicalResponders": 0,
        },
        "probes": [],
        "responders": [],
    }

    with (
        patch("src.agent.scan_executor.read_control_units", return_value=discovery_result),
        patch("src.agent.scan_executor.read_vin", return_value=VinResult.supported("WDD2130041A123456")),
        patch(
            "src.agent.scan_executor.read_fault_codes",
            return_value=[FaultCode("P0301", status="ACTIVE", ecu="ECM")],
        ),
    ):
        execute_scan(client, ConnectedAdapter(), job)

    events = [post[1]["event"] for post in client.posts]
    assert events == [
        "ADAPTER_CONNECTED",
        "VIN_READ",
        "CONTROL_UNIT_DISCOVERY_READ",
        "DTC_READ",
    ]
    assert client.posts[2][1]["sessionId"] == "session-from-vin"


def test_execute_scan_runs_control_unit_discovery_before_vin_and_dtc():
    client = Client(
        responses=[
            Response({"status": "OK"}),
            Response({"status": "OK"}),
            Response({"status": "RUNNING"}),
            Response({"status": "COMPLETED"}),
        ],
    )
    job = ScanJob(
        "scan-123",
        "RUNNING",
        "2026-06-09T00:00:00Z",
        diagnostic_session_id="session-123",
    )
    discovery_result = {
        "version": 1,
        "strategy": "GENERIC_OBD_CAN",
        "scanMode": "FUNCTIONAL_THEN_PHYSICAL",
        "probeSequence": ["22F190"],
        "startedAt": "2026-06-15T12:00:00+00:00",
        "completedAt": "2026-06-15T12:00:01+00:00",
        "summary": {
            "totalProbes": 1,
            "respondersFound": 1,
            "functionalResponders": 1,
            "physicalResponders": 0,
        },
        "probes": [],
        "responders": [],
    }

    with (
        patch("src.agent.scan_executor.read_control_units", return_value=discovery_result),
        patch("src.agent.scan_executor.read_vin", return_value=VinResult.supported("WDD2130041A123456")),
        patch(
            "src.agent.scan_executor.read_fault_codes",
            return_value=[FaultCode("P0301", status="ACTIVE", ecu="ECM")],
        ),
    ):
        execute_scan(client, ConnectedAdapter(), job)

    events = [post[1]["event"] for post in client.posts]
    assert events == [
        "ADAPTER_CONNECTED",
        "CONTROL_UNIT_DISCOVERY_READ",
        "VIN_READ",
        "DTC_READ",
    ]

    discovery_post = client.posts[1][1]
    assert discovery_post["sessionId"] == "session-123"
    assert discovery_post["payload"]["controlUnitDiscovery"] == discovery_result


def test_execute_scan_skips_control_unit_discovery_without_any_session_id(capsys):
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
        patch("src.agent.scan_executor.read_control_units") as read_control_units,
        patch(
            "src.agent.scan_executor.read_fault_codes",
            return_value=[FaultCode("P0301", status="ACTIVE", ecu="ECM")],
        ),
    ):
        execute_scan(client, ConnectedAdapter(), job)

    read_control_units.assert_not_called()
    assert [post[1]["event"] for post in client.posts] == [
        "ADAPTER_CONNECTED",
        "DTC_READ",
    ]
    assert "Control unit discovery skipped: missing session id" in capsys.readouterr().out


def test_scan_job_from_api_maps_diagnostic_session_id_aliases():
    scan_job = ScanJob.from_api(
        {
            "id": "scan-123",
            "status": "RUNNING",
            "createdAt": "2026-06-09T00:00:00Z",
            "vehicleId": "vehicle-123",
            "diagnosticSessionId": "session-123",
        }
    )

    assert scan_job.diagnostic_session_id == "session-123"
    assert scan_job.session_id == "session-123"

    legacy_alias_job = ScanJob.from_api(
        {
            "id": "scan-456",
            "status": "RUNNING",
            "createdAt": "2026-06-09T00:00:00Z",
            "vehicleId": "vehicle-456",
            "sessionId": "session-456",
        }
    )

    assert legacy_alias_job.diagnostic_session_id == "session-456"
    assert legacy_alias_job.session_id == "session-456"


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


def test_execute_vehicle_data_read_emits_session_error_when_read_fails():
    from src.main import execute_vehicle_data_read

    client = Client()

    with patch("src.agent.scan_executor.read_vehicle_health", side_effect=RuntimeError("PID read failed")):
        execute_vehicle_data_read(client, "session-1", ConnectedAdapter())

    assert client.posts == [
        (
            "/obd/agents/agent-123/scan-events",
            {
                "sessionId": "session-1",
                "event": "ERROR",
                "payload": {"message": "PID read failed"},
            },
        ),
    ]


# ---------------------------------------------------------------------------
# Control Unit Discovery integration tests
# ---------------------------------------------------------------------------


def test_execute_control_unit_discovery_emits_event():
    """execute_control_unit_discovery emits CONTROL_UNIT_DISCOVERY_READ
    with the expected payload shape."""
    from src.agent.scan_executor import execute_control_unit_discovery

    discovery_result = {
        "version": 1,
        "strategy": "GENERIC_OBD_CAN",
        "scanMode": "FUNCTIONAL_THEN_PHYSICAL",
        "probeSequence": ["22F190"],
        "startedAt": "2026-06-15T12:00:00+00:00",
        "completedAt": "2026-06-15T12:00:03+00:00",
        "summary": {
            "totalProbes": 9,
            "respondersFound": 1,
            "functionalResponders": 1,
            "physicalResponders": 1,
        },
        "probes": [
            {
                "method": "FUNCTIONAL",
                "requestId": "7DF",
                "probe": "22F190",
                "responseId": "7E8",
                "status": "DISCOVERED",
                "responseType": "NEGATIVE",
                "negativeResponseCode": "11",
                "negativeResponseMeaning": "SERVICE_NOT_SUPPORTED",
                "rawHeader": "7E8",
                "rawPayload": "037F2211",
                "rawResponse": "7E8037F2211",
                "errorCode": None,
            },
        ],
        "responders": [
            {
                "responseId": "7E8",
                "discoveredBy": [
                    {"method": "FUNCTIONAL", "requestId": "7DF", "probe": "22F190"},
                ],
                "firstSeenBy": "FUNCTIONAL",
                "confirmedByPhysical": True,
                "confidence": "HIGH",
                "ecuName": None,
                "ecuType": None,
                "protocol": "UDS_ON_CAN_11BIT",
                "capabilities": {
                    "respondedToF190": True,
                    "positiveF190": False,
                    "negativeF190": True,
                },
            },
        ],
    }

    client = Client(responses=[Response({"status": "OK"})])

    with patch(
        "src.agent.scan_executor.read_control_units",
        return_value=discovery_result,
    ):
        execute_control_unit_discovery(client, "session-discovery-1", ConnectedAdapter())

    assert len(client.posts) == 1
    post_path, post_body = client.posts[0]
    assert post_path == "/obd/agents/agent-123/scan-events"
    assert post_body["sessionId"] == "session-discovery-1"
    assert post_body["event"] == "CONTROL_UNIT_DISCOVERY_READ"

    payload = post_body["payload"]
    assert "controlUnitDiscovery" in payload
    cud = payload["controlUnitDiscovery"]
    assert cud["version"] == 1
    assert cud["strategy"] == "GENERIC_OBD_CAN"
    assert cud["scanMode"] == "FUNCTIONAL_THEN_PHYSICAL"
    assert cud["probeSequence"] == ["22F190"]
    assert "startedAt" in cud
    assert "completedAt" in cud
    assert "summary" in cud
    assert "probes" in cud
    assert "responders" in cud


def test_execute_control_unit_discovery_skips_when_adapter_disconnected():
    """execute_control_unit_discovery skips discovery and emits no event
    when the adapter is not connected."""
    from src.agent.scan_executor import execute_control_unit_discovery

    client = Client()

    with patch(
        "src.agent.scan_executor.read_control_units",
    ) as mock_read:
        execute_control_unit_discovery(client, "session-disc-1", DisconnectedAdapter())
        # read_control_units should NOT be called
        mock_read.assert_not_called()

    # No event emitted when adapter is disconnected
    assert len(client.posts) == 0


def test_execute_control_unit_discovery_emits_partial_on_failure():
    """execute_control_unit_discovery emits CONTROL_UNIT_DISCOVERY_READ
    with an empty-structure payload when discovery throws an exception."""
    from src.agent.scan_executor import execute_control_unit_discovery

    client = Client(responses=[Response({"status": "OK"})])

    with patch(
        "src.agent.scan_executor.read_control_units",
        side_effect=RuntimeError("Adapter crashed"),
    ):
        execute_control_unit_discovery(client, "session-fail-1", ConnectedAdapter())

    assert len(client.posts) == 1
    post_path, post_body = client.posts[0]
    assert post_body["event"] == "CONTROL_UNIT_DISCOVERY_READ"

    cud = post_body["payload"]["controlUnitDiscovery"]
    # Error fallback should have an empty structure
    assert cud["version"] == 1
    assert cud["strategy"] == "GENERIC_OBD_CAN"
    assert cud["scanMode"] == "FUNCTIONAL_THEN_PHYSICAL"
    assert cud["summary"]["totalProbes"] == 0
    assert cud["summary"]["respondersFound"] == 0
    assert len(cud["probes"]) == 0
    assert len(cud["responders"]) == 0
