# Run Relay in PyCharm

## Open the project

Clone the repository and open its root folder in PyCharm. Installed dependencies belong in `.venv` and `apps/web/node_modules`; application source files are under `apps`.

1. Open this folder in PyCharm.
2. Under **Settings → Project → Python Interpreter**, choose the existing `.venv\Scripts\python.exe`.
3. If using a clean copy, run the installation commands in the README first.
4. Open `run.py`, right-click, and select **Run 'run'**.
5. Visit **http://127.0.0.1:8000**. Choose the demo to explore sample incidents, or register your own workspace.
6. Stop the application with PyCharm's Stop button. Your working data remains in `data/relay.db`.

The launcher applies database migrations automatically. Rebuild with `npm run build --prefix apps/web` after changing frontend code, or use Vite's development server for hot reload.

## What is in the clean package?

`Relay.zip` contains a single `Relay/` folder with source, tests, screenshots, docs, configuration templates, and a built frontend. It excludes `.git`, `.idea`, `.venv`, `node_modules`, `.env`, local databases, logs, and test reports. Python environments are machine-specific: create a fresh `.venv` after extracting the package. A first-time installation requires internet access for dependencies; normal extractive-mode use does not.

Keep working in one folder to avoid divergent copies. The package is a snapshot, not a synchronized backup.

## Configuration

No `.env` file is necessary for the offline demo. To persist sessions across server restarts, set a stable secret:

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```

Copy the generated value into your private `.env` as `RELAY_SECRET_KEY=...`. Do not include it in a repository or shared package. Without this setting, a process-local key is generated and restarting signs users out. Registered accounts can sign back in. Anonymous demo workspaces have no recovery credentials; use a registered account for work you want to retain access to.

Use **127.0.0.1** consistently rather than switching between it and `localhost`, because cookies are host-specific.

## Windows application-control troubleshooting

Some Windows policies block unsigned optional native extensions. On the development machine, SQLAlchemy's compiled wheel was blocked; its supported pure-Python build worked. Install that build without changing the Windows policy:

```powershell
$env:DISABLE_SQLALCHEMY_CEXT = '1'
.\.venv\Scripts\python.exe -m pip install --force-reinstall --no-deps --no-binary sqlalchemy sqlalchemy==2.1.4
Remove-Item Env:DISABLE_SQLALCHEMY_CEXT
```

Official reference: [SQLAlchemy installation and optional Cython extensions](https://docs.sqlalchemy.org/en/21/intro.html#building-the-cython-extensions).

If the development formatter's optional compiled distribution is blocked, use:

```powershell
.\.venv\Scripts\python.exe -m pip install --force-reinstall --no-deps --no-binary black black
```

If port 8000 is already occupied, stop the earlier Relay instance before starting another. The application supports one API process and one analysis worker; do not launch several instances against the same database.

Browser tests use installed Microsoft Edge on Windows because the downloaded headless-shell executable was blocked by the local Windows policy. Linux CI uses Playwright Chromium. To select another supported installed browser, set `RELAY_BROWSER_CHANNEL` (for example, `chrome`).

## Working with Git

The repository excludes environment files, local databases, dependency directories, compiled frontend assets, and IDE settings. Build the frontend after cloning. Keep `.env.example` limited to safe configuration examples and inspect staged files before committing.
