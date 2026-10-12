"""Create a clean source folder and ZIP without copying secrets or local state."""

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "README.md",
    "LICENSE",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "START_HERE.md",
    ".gitignore",
    ".gitattributes",
    ".editorconfig",
    ".dockerignore",
    ".env.example",
    ".flake8",
    ".prettierrc.json",
    "pyproject.toml",
    "requirements.lock",
    "alembic.ini",
    "run.py",
    "Dockerfile",
    "compose.yaml",
    "apps/web/package.json",
    "apps/web/package-lock.json",
    "apps/web/index.html",
    "apps/web/tsconfig.json",
    "apps/web/vite.config.ts",
    "apps/web/playwright.config.ts",
]
DIRECTORIES = [
    "apps/api/relay",
    "apps/web/src",
    "apps/web/e2e",
    "apps/web/dist",
    "migrations",
    "tests",
    "scripts",
    "docs",
    ".github",
]
SKIP_PARTS = {"__pycache__", ".pytest_cache", "node_modules", ".venv"}


def package(destination: Path):
    destination = destination.resolve()
    archive = destination.with_suffix(".zip")
    if destination.exists() or archive.exists():
        raise SystemExit(
            "Destination already exists. Choose a new folder name to preserve the previous package."
        )
    if destination == ROOT or ROOT in destination.parents:
        raise SystemExit("Choose a destination outside the source project.")
    sources = [ROOT / name for name in FILES]
    for directory in DIRECTORIES:
        sources.extend(
            path
            for path in (ROOT / directory).rglob("*")
            if path.is_file()
            and not (set(path.relative_to(ROOT).parts) & SKIP_PARTS)
            and path.relative_to(ROOT).as_posix() != "docs/PORTFOLIO.md"
            and path.suffix not in {".pyc", ".pyo", ".log"}
        )
    if any(not source.is_file() for source in sources):
        raise SystemExit(
            "A required package file is missing. Finish the build and documentation first."
        )
    manifest = {}
    for source in sorted(set(sources)):
        relative = source.relative_to(ROOT)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        manifest[relative.as_posix()] = hashlib.sha256(target.read_bytes()).hexdigest()
    (destination / "MANIFEST.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as bundle:
        for path in sorted(destination.rglob("*")):
            if path.is_file():
                bundle.write(path, Path(destination.name) / path.relative_to(destination))
    with ZipFile(archive) as bundle:
        if bundle.testzip() is not None:
            raise SystemExit("Archive integrity validation failed.")
    print(
        f"Folder: {destination}\nArchive: {archive}\nFiles: {len(manifest) + 1}\nSize: {archive.stat().st_size / 1024 / 1024:.2f} MB"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, default=ROOT.parent / "Relay-distribution")
    package(parser.parse_args().destination)
