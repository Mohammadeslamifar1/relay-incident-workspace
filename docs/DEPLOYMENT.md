# Deployment notes

## Local container stack

Start Docker Desktop, then run `docker compose up --build` from the repository root. Compose creates PostgreSQL and one non-root application container. The app applies Alembic migrations and serves the built UI and API on http://127.0.0.1:8000. The database port is not published to the host.

`docker compose down` stops the stack without removing its named data volume. Treat volume deletion as a destructive operation. The Docker stack is optional; PyCharm and `run.py` use SQLite by default.

## Before internet exposure

The checked-in Compose defaults are for a local demonstration. Use a reverse proxy with HTTPS, set `RELAY_COOKIE_SECURE=true`, generate a stable random `RELAY_SECRET_KEY`, replace the development database password, set the exact public `RELAY_ALLOWED_ORIGINS`, and disable `RELAY_DEMO_ENABLED`. Decide how accounts are provisioned: this release has open registration and no email verification, invitation or password-recovery flow.

Run exactly one API process. Scale-out requires leased queue claims and shared rate limiting. Set proxy request limits/timeouts, per-tenant quotas, retention, backup/restore procedures and provider spending limits. Use managed secrets. Do not log incident bodies or upload sensitive operational documents without an appropriate data policy.

Migrations should be a single deployment step when you move beyond one replica. Do not rely on every replica concurrently running the entrypoint. Validate PostgreSQL behavior and restoration in your deployment environment before trusting it with important data.

The `/api/health` endpoint checks database connectivity, not provider connectivity or queue progress. Worker heartbeat and queue-age metrics are a future operational enhancement. HTTP request logs include request ID, route, status and duration; the application does not claim an OpenTelemetry tracing installation.
