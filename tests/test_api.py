import time

import jwt
from fastapi.testclient import TestClient
from relay.auth import COOKIE
from relay.db import User
from sqlalchemy import select


def first_incident(client):
    return client.get("/api/incidents").json()[0]


def completed(client, incident_id, key="test-request-001"):
    response = client.post(f"/api/incidents/{incident_id}/analyses", json={"idempotency_key": key})
    assert response.status_code == 202, response.text
    job_id = response.json()["id"]
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        data = client.get(f"/api/incidents/{incident_id}").json()
        analysis = next(a for a in data["analyses"] if a["id"] == job_id)
        if analysis["status"] in {"completed", "failed"}:
            assert analysis["status"] == "completed", analysis
            return analysis
        time.sleep(0.04)
    raise AssertionError("Worker did not finish the analysis within 10 seconds")


def test_health_and_unauthenticated_access(client):
    assert client.get("/api/health").json()["provider"] == "extractive"
    assert client.get("/api/incidents").status_code == 401
    assert client.get("/api/documents").status_code == 401


def test_register_login_logout(client):
    payload = {
        "name": "Alex Morgan",
        "email": "Alex@example.com",
        "password": "long-example-password",
        "workspace": "Platform",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201
    assert response.json()["email"] == "alex@example.com"
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "samesite=strict" in response.headers["set-cookie"].lower()
    assert client.get("/api/incidents").json() == []
    assert client.post("/api/auth/register", json=payload).status_code == 409
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.post(
            "/api/auth/login", json={"email": "alex@example.com", "password": "wrong"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login", json={"email": "ALEX@example.com", "password": payload["password"]}
        ).status_code
        == 200
    )
    assert client.get("/api/auth/me").json()["workspace"] == "Platform"


def test_isolated_demo_workspaces_and_idor(demo, app):
    incident = first_incident(demo)
    document = demo.get("/api/documents").json()[0]
    # Same ASGI app, separate cookie jar; do not start a second application worker.
    other = TestClient(app)
    assert other.post("/api/auth/demo").status_code == 200
    assert first_incident(other)["id"] != incident["id"]
    assert other.get(f"/api/incidents/{incident['id']}").status_code == 404
    assert (
        other.patch(
            f"/api/incidents/{incident['id']}", json={"status": "monitoring", "version": 1}
        ).status_code
        == 404
    )
    assert (
        other.post(
            f"/api/incidents/{incident['id']}/analyses",
            json={"idempotency_key": "cross-tenant-test"},
        ).status_code
        == 404
    )
    assert other.delete(f"/api/documents/{document['id']}").status_code == 404
    assert other.get(f"/api/incidents/{incident['id']}/export").status_code == 404
    other.close()


def test_status_transition_and_optimistic_concurrency(demo):
    incident = first_incident(demo)
    url = f"/api/incidents/{incident['id']}"
    assert demo.patch(url, json={"status": "resolved", "version": 1}).status_code == 422
    response = demo.patch(url, json={"status": "monitoring", "version": 1})
    assert response.status_code == 200
    assert response.json()["version"] == 2
    assert demo.patch(url, json={"status": "resolved", "version": 1}).status_code == 409
    assert demo.patch(url, json={"status": "resolved", "version": 2}).status_code == 200
    assert demo.patch(url, json={"status": "investigating", "version": 3}).status_code == 200
    assert len(demo.get(url).json()["events"]) == 4


def test_analysis_idempotency_reviews_and_export(demo, app):
    incident = first_incident(demo)
    analysis = completed(demo, incident["id"])
    assert len(analysis["evidence"]) >= 1
    assert len(analysis["trace"]) == 4
    assert analysis["provider"] == "extractive"
    second = demo.post(
        f"/api/incidents/{incident['id']}/analyses", json={"idempotency_key": "test-request-001"}
    )
    assert second.json()["id"] == analysis["id"]
    assert len(demo.get(f"/api/incidents/{incident['id']}").json()["analyses"]) == 1
    ids = {e["id"] for e in analysis["evidence"]}
    for claim in [*analysis["result"]["hypotheses"], *analysis["result"]["actions"]]:
        assert set(claim["evidence_ids"]) <= ids
    url = f"/api/analyses/{analysis['id']}/decisions"
    assert (
        demo.post(
            url, json={"action_index": 900, "verdict": "approved", "note": "Looks fine"}
        ).status_code
        == 422
    )
    decision = {
        "action_index": 0,
        "verdict": "approved",
        "note": "Confirmed against current telemetry",
    }
    assert demo.post(url, json=decision).status_code == 201
    assert demo.post(url, json={**decision, "verdict": "rejected"}).status_code == 409
    export = demo.get(f"/api/incidents/{incident['id']}/export")
    assert export.status_code == 200
    assert "Evidence snapshots" in export.text
    assert "Confirmed against current telemetry" in export.text
    assert "not executed" in export.text
    assert "attachment" in export.headers["content-disposition"]
    other = TestClient(app)
    other.post("/api/auth/demo")
    assert other.post(url, json=decision).status_code == 404
    other.close()


def test_evidence_snapshot_survives_document_deletion(demo):
    incident = first_incident(demo)
    analysis = completed(demo, incident["id"])
    source = analysis["evidence"][0]
    assert demo.delete(f"/api/documents/{source['document_id']}").status_code == 204
    fresh = demo.get(f"/api/incidents/{incident['id']}").json()["analyses"][0]
    assert fresh["evidence"] == analysis["evidence"]
    assert source["document_id"] not in {d["id"] for d in demo.get("/api/documents").json()}


def test_document_ingestion_redaction_and_duplicates(demo):
    doc = {
        "title": "Queue operations",
        "service": "worker",
        "kind": "runbook",
        "content": "Inspect queue backlog. api_key=super-secret-value\nNever replay without idempotency keys.",
    }
    response = demo.post("/api/documents", json=doc)
    assert response.status_code == 201
    assert "super-secret-value" not in response.text
    assert "[REDACTED]" in response.json()["content"]
    assert demo.post("/api/documents", json=doc).status_code == 409
    assert demo.post("/api/documents", json={**doc, "content": "short"}).status_code == 422


def test_absent_evidence_abstains(demo):
    incident = demo.post(
        "/api/incidents",
        json={
            "title": "Lunar habitat oxygen scrubber",
            "service": "moon-base",
            "severity": "SEV2",
            "summary": "Titanium calibration modules and oxygen scrubber alignment are failing in the lunar habitat.",
        },
    ).json()
    analysis = completed(demo, incident["id"])
    assert analysis["result"]["abstained"]
    assert analysis["result"]["actions"] == []
    assert analysis["evidence"] == []


def test_viewer_cannot_mutate(demo, app):
    user_id = demo.get("/api/auth/me").json()["id"]
    with app.state.sessions() as db:
        user = db.get(User, user_id)
        user.role = "viewer"
        db.commit()
    assert demo.get("/api/incidents").status_code == 200
    assert demo.post("/api/evaluations").status_code == 403
    assert (
        demo.post(
            "/api/incidents",
            json={
                "title": "A new problem",
                "summary": "Enough detail about this incident.",
                "service": "test-api",
            },
        ).status_code
        == 403
    )


def test_csrf_and_body_limits(demo):
    assert (
        demo.post("/api/evaluations", headers={"Origin": "https://evil.example"}).status_code == 403
    )
    assert (
        demo.post("/api/evaluations", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    )
    assert demo.post("/api/documents", content="x" * 150001).status_code == 413
    assert (
        demo.post("/api/evaluations", headers={"Origin": "http://127.0.0.1:8000"}).status_code
        == 201
    )


def test_expired_and_tampered_sessions(client, app):
    expired = jwt.encode(
        {"sub": "fake", "iat": 1, "exp": 2, "aud": "relay"},
        app.state.settings.secret_key,
        algorithm="HS256",
    )
    assert client.get("/api/auth/me", headers={"Cookie": f"{COOKIE}={expired}"}).status_code == 401
    assert client.get("/api/auth/me", headers={"Cookie": f"{COOKIE}=invalid"}).status_code == 401


def test_evaluation_and_security_headers(demo):
    response = demo.post("/api/evaluations")
    assert response.status_code == 201
    result = response.json()["results"]
    assert len(result["cases"]) == 8
    assert all(case["passed"] for case in result["cases"])
    assert result["metrics"]["recall_at_3"] == 1
    assert len(demo.get("/api/evaluations").json()) == 1
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-request-id"]


def test_demo_disable_and_rate_limits(client, app):
    app.state.settings.demo_enabled = False
    assert client.post("/api/auth/demo").status_code == 403
    for _ in range(19):
        client.post("/api/auth/login", json={"email": "missing@example.com", "password": "wrong"})
    response = client.post(
        "/api/auth/login", json={"email": "missing@example.com", "password": "wrong"}
    )
    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"


def test_user_password_is_never_serialized(demo, app):
    assert "password" not in demo.get("/api/auth/me").text
    with app.state.sessions() as db:
        assert db.scalar(select(User)).password_hash is None
