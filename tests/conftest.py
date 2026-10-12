import pytest
from fastapi.testclient import TestClient
from relay.config import Settings
from relay.main import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(
        Settings(
            database_url=f"sqlite:///{tmp_path / 'test.db'}",
            secret_key="test-secret-" * 5,
            ai_provider="extractive",
            static_dir=tmp_path / "no-static",
        ),
        create_tables=True,
    )


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        yield client


@pytest.fixture
def demo(client):
    assert client.post("/api/auth/demo").status_code == 200
    return client
