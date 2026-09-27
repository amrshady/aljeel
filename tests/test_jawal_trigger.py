from pathlib import Path

from flask import Flask

from scripts import jawal_trigger


def _client():
    app = Flask(__name__)
    app.register_blueprint(jawal_trigger.bp)
    return app.test_client()


def test_auth_rejects_missing_trigger_key(monkeypatch):
    monkeypatch.setenv("JAWAL_TRIGGER_KEY", "secret")
    response = _client().post("/jawal/run", json={})
    assert response.status_code == 401
    assert response.get_json() == {"error": "unauthorized"}


def test_bad_batch_id_validation(monkeypatch):
    monkeypatch.setenv("JAWAL_TRIGGER_KEY", "secret")
    response = _client().post(
        "/jawal/run",
        headers={"X-Jawal-Trigger-Key": "secret"},
        json={"batch_id": "J26/954"},
    )
    assert response.status_code == 400
    assert response.get_json()["error"] == "batch_id must match ^J26-\\d+$"


def test_bad_recipients_validation(monkeypatch):
    monkeypatch.setenv("JAWAL_TRIGGER_KEY", "secret")
    response = _client().post(
        "/jawal/run",
        headers={"X-Jawal-Trigger-Key": "secret"},
        json={"batch_id": "J26-954", "recipients": "amr@accordpartners.ai"},
    )
    assert response.status_code == 400
    assert response.get_json()["error"] == "recipients must be a list of email addresses"


def test_enqueue_returns_accepted(monkeypatch):
    monkeypatch.setenv("JAWAL_TRIGGER_KEY", "secret")
    monkeypatch.setattr(jawal_trigger, "_execute_job", lambda job: None)
    monkeypatch.setattr(jawal_trigger, "_send_email", lambda *args, **kwargs: True)

    response = _client().post(
        "/jawal/run",
        headers={"X-Jawal-Trigger-Key": "secret"},
        json={"batch_id": "J26-954", "recipients": ["ops@example.com"]},
    )

    assert response.status_code == 202
    data = response.get_json()
    assert data["status"] == "queued"
    assert data["queue_position"] >= 1
    assert data["run_id"]


def test_status_unknown_run_id_returns_404(monkeypatch):
    monkeypatch.setenv("JAWAL_TRIGGER_KEY", "secret")
    response = _client().get(
        "/jawal/run/not-found",
        headers={"X-Jawal-Trigger-Key": "secret"},
    )
    assert response.status_code == 404
    assert response.get_json() == {"error": "not found"}


def test_openapi_routes_return_200():
    client = _client()
    json_response = client.get("/jawal/openapi.json")
    yaml_response = client.get("/jawal/openapi.yaml")
    assert json_response.status_code == 200
    assert yaml_response.status_code == 200


def test_stage_portal_docs_cleans_stale_inputs_and_pins_invoice(monkeypatch, tmp_path):
    monkeypatch.setattr(jawal_trigger, "ROOT", tmp_path)
    batch_dir = tmp_path / "batches" / "jawal-J26-954"
    raw_dir = batch_dir / "raw"
    raw_dir.mkdir(parents=True)
    (raw_dir / "stale.pdf").write_bytes(b"stale")
    (batch_dir / "invoice-source.xlsx").write_bytes(b"old")
    (batch_dir / "output").mkdir()
    (batch_dir / "output" / "keep.txt").write_text("keep")

    source = tmp_path / "source"
    source.mkdir()
    (source / "wrong-invoice.xlsx").write_bytes(b"wrong")
    (source / "doc-123-report.xlsx").write_bytes(b"right")
    (source / "evidence.pdf").write_bytes(b"evidence")

    _, staged_raw, invoice_path, staged_count = jawal_trigger._stage_jawal_portal_docs(
        "J26-954", str(source), "doc-123"
    )

    assert not (staged_raw / "stale.pdf").exists()
    assert Path(invoice_path).read_bytes() == b"right"
    assert (staged_raw / "wrong-invoice.xlsx").read_bytes() == b"wrong"
    assert (staged_raw / "evidence.pdf").read_bytes() == b"evidence"
    assert staged_count == 2
    assert (batch_dir / "output" / "keep.txt").read_text() == "keep"


def test_stage_portal_docs_keeps_deterministic_filename_fallback(monkeypatch, tmp_path):
    monkeypatch.setattr(jawal_trigger, "ROOT", tmp_path)
    source = tmp_path / "source"
    source.mkdir()
    (source / "b-report.xlsx").write_bytes(b"report")
    (source / "a-invoice.xlsx").write_bytes(b"invoice")

    _, _, invoice_path, _ = jawal_trigger._stage_jawal_portal_docs("J26-954", str(source))

    assert Path(invoice_path).read_bytes() == b"invoice"


def test_stage_portal_docs_rejects_missing_pinned_invoice(monkeypatch, tmp_path):
    monkeypatch.setattr(jawal_trigger, "ROOT", tmp_path)
    source = tmp_path / "source"
    source.mkdir()
    (source / "other-invoice.xlsx").write_bytes(b"wrong")

    try:
        jawal_trigger._stage_jawal_portal_docs("J26-954", str(source), "missing-doc")
    except ValueError as exc:
        assert "expected exactly one staged invoice" in str(exc)
    else:
        raise AssertionError("missing pinned invoice should fail")
