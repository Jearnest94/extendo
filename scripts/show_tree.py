#!/usr/bin/env python3
from datetime import datetime
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
    # Put a timestamp in the filename.
    # This is a bit of a hack, but it works.

    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    root = Path(".").resolve()
    print(f"{root.name}/")
    # Write to file as well.
    i = 1
    while True:
        filename = f"tmp/tree_{timestamp}_{i}.txt"
        if not Path(filename).exists():
            break
        i += 1
    import sys

    with open(filename, "w") as f:
        f.write(f"{root.name}/\n")
        sys.stdout = f
        walk(root)
