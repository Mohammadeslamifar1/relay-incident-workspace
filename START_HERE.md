# Welcome to Relay

This folder is the complete project. **Open this folder in PyCharm.**

1. Create/select a Python virtual environment (Python 3.12+, tested with 3.14).
2. In the PyCharm terminal, install: `python -m pip install -c requirements.lock -e ".[dev]"`.
3. Install Node.js 24, run `npm ci --prefix apps/web`, then `npm run build --prefix apps/web`. A packaged ZIP may already include the built interface.
4. Open `run.py` and click **Run**.
5. Open **http://127.0.0.1:8000** and click **Explore the demo workspace**.

If `apps/web/dist` is missing, install Node.js 24 and run `npm ci --prefix apps/web`, then `npm run build --prefix apps/web` first.

- **How to use and develop it:** [README.md](README.md)
- **PyCharm setup and Windows troubleshooting:** [docs/SETUP.md](docs/SETUP.md)
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Demo walkthrough:** [docs/DEMO.md](docs/DEMO.md)
- **Evaluation methodology:** [docs/EVALUATION.md](docs/EVALUATION.md)

Default mode runs locally without an API key. This package contains no personal database, credentials, Git history, or machine-specific Python environment.
