<img src="EXTENDO.png" alt="Extendo banner" height="350">


# Extendo  

    A lightweight Chrome side-kick that keeps the heavy analytics on the server.

## Overview

Extendo pairs a Chrome extension with a Flask + MongoDB backend to turn every Faceit CS2 match-room into an instant scouting report—map-veto advice, player dossiers, utility habits—all before the knife round ends.

## Key Features
1. Map-veto wizard	Picks their pain points and your comfort pick.
2. Player dossiers	CT spots, entry %s, AWP addiction, nade spam stats.
3. Real-time results	***Multi-core demo parsing + caching ⇒ answers in seconds.***
3. ****Resulting in decisive heatmaps that WIN GAMES…****

     ##### seriously

## Tech Stack

One-command dev loop	docker-compose up spins Flask & Mongo while the extension hot-reloads.
CI that screams early	GitHub Actions: black → isort → flake8 → pytest → npm test → Docker build.

    Frontend — Chrome Extension (Vanilla JS or Vue/Vite)
    Backend — Python 3.11, Flask, Gunicorn
    Data crunching — demoinfocs via awpy
    DB — MongoDB 7
    Containers — Docker + docker-compose
    CI/CD — GitHub Actions (fail fast or go home)

## What **actually** works

| Piece | Reality check |
|-------|---------------|
| **Health endpoint** | `GET /api/health` → `{"status":"ok"}` |
| **Faceit client** | Python wrapper (`faceit.py`) with tiny LRU cache; tested against live API (`pytest` passes). |
| **Docker** | `docker-compose up` spins Flask on **:5000** and MongoDB on **:27017**. |
| **Frontend** | Chrome Extension (vanilla JS, will migrate to Vite when useful |
| **Chrome extension** | Injects a banner with the health-check result on any page (see `content.js`; vanilla JS; Vite migration planned). |
| **Database** | MongoDB 7 container ready (stats persistence TBD). |
| **Data crunching** | `awpy` / `demoinfocs-golang` (Rust) – *planned, not wired yet*. |
| **CI / linting** | `black`, `isort`, `flake8`, `pytest`, `vitest` – wired via `pre-commit` + GitHub Actions. |
| **CI/CD hooks** | Pre-commit enforces formatting; Actions fail fast on any red test or linter error. |
| **Tests** | 3 Python tests for Faceit client, 1 JS dummy test – all green. |

_Anything not in that table is aspirational marketing and will 404 if you look for it._

## Quick Start

1. git clone https://github.com/Jearnest94/extendo.git
1. cd extendo
1. docker-compose up           # backend on :5000, Mongo on :27017

### backend
    python -m venv .venv && source .venv/bin/activate  # Windows? Use PowerShell dance.
    pip install -r requirements.txt
    export FACEIT_API_KEY=<your key>                   # or set in .env
    flask --app main run                               # :5000

### Load the extension:
    Chrome → Extensions → Developer mode → “Load unpacked” → select extension-chrome/
    
### Health check:
    curl http://localhost:5000/api/health → {"status":"ok"}

### Contributing
    python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
    pre-commit install – lint before you commit.

Ship data-driven smack-talk, not guesswork. PRs welcome.
