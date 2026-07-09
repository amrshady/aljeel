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
