from unittest.mock import patch

from src.models.fault_code import FaultCode
from src.obd.commands.dtc import read_fault_codes
from src.obd.commands.vin import read_vin
from src.obd.elm327 import Elm327Adapter
from src.obd.mock_adapter import MockObdAdapter


def test_mock_adapter_returns_expected_vin_and_logs(capsys):
    adapter = MockObdAdapter()

    vin = read_vin(adapter)

    assert vin == "W1KAF4GB1RF124321"
    output = capsys.readouterr().out
    assert "Using mock OBD adapter" in output
    assert "Mock VIN read" in output


def test_mock_adapter_returns_expected_fault_codes_and_logs(capsys):
    adapter = MockObdAdapter()

    faults = read_fault_codes(adapter)

    assert [fault.to_dict() for fault in faults] == [
        {
            "code": "P0301",
            "permanent": False,
            "status": "ACTIVE",
            "ecu": "ECM",
        },
        {
            "code": "U0100",
            "permanent": False,
            "status": "ACTIVE",
            "ecu": "TCM",
        },
        {
            "code": "P0171",
            "permanent": False,
            "status": "PENDING",
            "ecu": "ECM",
        },
    ]
    assert "Mock DTCs read" in capsys.readouterr().out


def test_fault_code_defaults_remain_backward_compatible():
    assert FaultCode("P0301").to_dict() == {
        "code": "P0301",
        "permanent": False,
        "status": "ACTIVE",
    }


def test_create_obd_adapter_uses_mock_when_enabled(monkeypatch):
    import src.main as main

    monkeypatch.setattr(main, "OBD_ADAPTER_TYPE", "mock")

    assert isinstance(main.create_obd_adapter(), MockObdAdapter)


def test_mock_adapter_heartbeat_payload_reports_connected():
    from src.heartbeat import send_heartbeat

    adapter = MockObdAdapter()

    class Client:
        agent_id = "agent-123"

        def post(self, path, json=None):
            self.path = path
            self.json = json
            return None

    client = Client()
    send_heartbeat(
        client,
        adapter.is_connected(),
        adapter.adapter_type,
        "MOCK",
        adapter.protocol,
    )

    assert client.path == "/obd/agents/agent-123/heartbeat"
    assert client.json["adapterConnected"] is True
    assert client.json["adapterType"] == "MOCK"
    assert client.json["protocol"] == "MOCK"


def test_heartbeat_loop_accepts_adapter_metadata(monkeypatch):
    from src import heartbeat

    calls = []

    def fake_send_heartbeat(
        api_client,
        adapter_connected,
        adapter_type=None,
        connection_type=None,
        protocol=None,
    ):
        calls.append((adapter_connected, adapter_type, connection_type, protocol))

    monkeypatch.setattr(heartbeat, "send_heartbeat", fake_send_heartbeat)
    monkeypatch.setattr(
        heartbeat.time,
        "sleep",
        lambda interval: (_ for _ in ()).throw(KeyboardInterrupt()),
    )

    try:
        heartbeat.heartbeat_loop(object(), MockObdAdapter(), interval=0)
    except KeyboardInterrupt:
        pass

    assert calls == [(True, "MOCK", "MOCK", "MOCK")]


def test_create_obd_adapter_uses_elm327_when_mock_disabled(monkeypatch):
    import src.main as main

    monkeypatch.setattr(main, "OBD_ADAPTER_TYPE", "usb")

    with patch("src.main.Elm327Adapter", return_value="real-adapter") as adapter:
        assert main.create_obd_adapter() == "real-adapter"
        adapter.assert_called_once_with()
