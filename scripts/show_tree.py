#!/usr/bin/env python3
from pathlib import Path

EXCLUDE = {".git", "__pycache__", "node_modules", ".venv", ".pytest_cache"}


def walk(base: Path, prefix: str = "") -> None:
    # filter & sort so you get deterministic output
    entries = sorted(p for p in base.iterdir() if p.name not in EXCLUDE)
    for i, path in enumerate(entries):
        # Use ASCII connectors for Windows compatibility
        connector = "+-- " if i == len(entries) - 1 else "|-- "
        print(f"{prefix}{connector}{path.name}")
        if path.is_dir():
            walk(path, prefix + ("    " if i == len(entries) - 1 else "|   "))


if __name__ == "__main__":
    root = Path(".").resolve()
    print(f"{root.name}/")
    walk(root)
