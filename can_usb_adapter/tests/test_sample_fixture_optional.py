from examples.load_sample import load_sample_frames


def test_sample_loader_returns_empty_when_absent(tmp_path) -> None:
    assert load_sample_frames(tmp_path / "missing.jsonl") == []


def test_sample_loader_reads_present_jsonl(tmp_path) -> None:
    path = tmp_path / "sample.jsonl"
    path.write_text(
        '{"timestamp":1.0,"channel":0,"arbitration_id":256,'
        '"is_extended_id":false,"is_remote_frame":false,'
        '"is_error_frame":false,"dlc":1,"data_hex":"11"}\n',
        encoding="utf-8",
    )
    frames = load_sample_frames(path)
    assert len(frames) == 1
    assert frames[0].arbitration_id == 0x100
