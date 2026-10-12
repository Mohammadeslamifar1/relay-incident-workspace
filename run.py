"""PyCharm entry point: migrate the database and serve the complete local application."""

import os
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config

ROOT = Path(__file__).resolve().parent

if __name__ == "__main__":
    os.chdir(ROOT)
    if not (ROOT / "apps/web/dist/index.html").exists():
        raise SystemExit("Build the interface first: cd apps/web && npm ci && npm run build")
    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    print(
        "\nRelay is ready at http://127.0.0.1:8000\nAPI documentation: http://127.0.0.1:8000/docs\n"
    )
    uvicorn.run("relay.main:app", host="127.0.0.1", port=8000, log_level="info")
