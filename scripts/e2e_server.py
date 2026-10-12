"""An isolated application for browser tests; never touches the developer's database."""

import os
from pathlib import Path
from tempfile import TemporaryDirectory

import uvicorn
from alembic import command
from alembic.config import Config

ROOT = Path(__file__).resolve().parents[1]

if __name__ == "__main__":
    os.chdir(ROOT)
    with TemporaryDirectory(prefix="relay-e2e-") as directory:
        os.environ["RELAY_DATABASE_URL"] = f"sqlite:///{Path(directory) / 'browser.db'}"
        os.environ["RELAY_AI_PROVIDER"] = "extractive"
        os.environ["RELAY_DEMO_ENABLED"] = "true"
        os.environ["RELAY_COOKIE_SECURE"] = "false"
        os.environ["RELAY_SECRET_KEY"] = "isolated-browser-test-secret-not-for-deployment"
        os.environ["RELAY_ALLOWED_ORIGINS"] = '["http://127.0.0.1:8001"]'
        command.upgrade(Config("alembic.ini"), "head")
        uvicorn.run(
            "relay.main:app", host="127.0.0.1", port=8001, log_level="warning", access_log=False
        )
