# faceit.py
import os
import time
from functools import lru_cache

import requests


class FaceitClient:
    BASE_URL = "https://open.faceit.com/data/v4"
    _ratelimit_sleep = 1.1  # simple back-off for free keys

    def __init__(
        self, api_key: str | None = None, session: requests.Session | None = None
    ):
        self.api_key = api_key or os.getenv("FACEIT_API_KEY")
        if not self.api_key:
            raise ValueError("FACEIT_API_KEY is missing (env var or arg).")
        self.session = session or requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {self.api_key}"})

    # ---------- low-level ---------- #
    def _get(self, path: str, timeout=20, **params):
        url = f"{self.BASE_URL}{path}"
        while True:
            resp = self.session.get(url, params=params, timeout=timeout)
            if resp.status_code == 429:  # rate limited
                time.sleep(self._ratelimit_sleep)
                continue
            resp.raise_for_status()
            return resp.json()

    # ---------- high-level helpers ---------- #
    @staticmethod
    def lru_cache_with_maxsize(maxsize=1024):
        def decorator(func):
            return lru_cache(maxsize=maxsize)(func)

        return decorator

    @lru_cache(maxsize=1024)
    def get_player(self, nickname: str | None = None, player_id: str | None = None):
        if not nickname and not player_id:
            raise ValueError("Must provide either nickname or player_id")
        if player_id:
            return self._get(f"/players/{player_id}")
        return self._get("/players", nickname=nickname)

    def player_stats(self, player_id: str, game: str = "cs2"):
        return self._get(f"/players/{player_id}/stats/{game}")

    def player_matches(self, player_id: str, game: str = "cs2", limit: int = 20, **kw):
        return self._get(f"/players/{player_id}/history", game=game, limit=limit, **kw)

    def match_details(self, match_id: str):
        return self._get(f"/matches/{match_id}")

    def match_stats(self, match_id: str):
        return self._get(f"/matches/{match_id}/stats")
