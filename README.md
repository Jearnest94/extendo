![Extendo banner](docs/extendo-banner.png)

Extendo  —  Scout smarter, not harder

    A lightweight Chrome side-kick that keeps the heavy analytics on the server.

Overview

Extendo pairs a Chrome extension with a Flask + MongoDB backend to turn every Faceit CS2 match-room into an instant scouting report—map-veto advice, player dossiers, utility habits—all before the knife round ends.
Key Features
Feature	What it gives you
Map-veto wizard	Picks their pain points and your comfort pick.
Player dossiers	CT spots, entry %s, AWP addiction, nade spam stats.
Real-time results	Multi-core demo parsing + caching ⇒ answers in seconds.
One-command dev loop	docker-compose up spins Flask & Mongo while the extension hot-reloads.
CI that screams early	GitHub Actions: black → isort → flake8 → pytest → npm test → Docker build.
Tech Stack

    Frontend — Chrome Extension (Vanilla JS or Vue/Vite)
    Backend — Python 3.11, Flask, Gunicorn
    Data crunching — demoinfocs via awpy
    DB — MongoDB 7
    Containers — Docker + docker-compose
    CI/CD — GitHub Actions (fail fast or go home)

Quick Start

git clone https://github.com/your-org/extendo.git
cd extendo
docker-compose up           # backend on :5000, Mongo on :27017

# Load the extension:
Chrome → Extensions → Developer mode → “Load unpacked” → select extension-chrome/
open https://faceit.com/match/<id>   # watch the magic

Health check:

curl http://localhost:5000/api/health
# → {"status":"ok"}

Contributing

    python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

    pre-commit install – lint before you commit.

    PRs must keep the CI green; red pipelines get roasted in the comments.

Ship data-driven smack-talk, not guesswork. PRs welcome.
