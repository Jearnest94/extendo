# faceit.py

import os
import time
import logging
from functools import lru_cache
import requests


logging.basicConfig(
    filename=os.getenv("FACEIT_LOGFILE", "faceit_client.log"),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)


class FaceitClient:
    BASE_URL = "https://open.faceit.com/data/v4"
    _ratelimit_sleep = 1.1  # simple back-off for free keys

    def __init__(
        self, api_key: str | None = None, session: requests.Session | None = None
    ):
        self.api_key = api_key or os.getenv("FACEIT_API_KEY")
        msg = f"[FaceitClient] Using API key: {'set' if self.api_key else 'MISSING'}"
        print(msg)
        logging.info(msg)
        if not self.api_key:
            raise ValueError("FACEIT_API_KEY is missing (env var or arg).")
        self.session = session or requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {self.api_key}"})
        msg = f"[FaceitClient] Session initialized with headers: {self.session.headers}"
        print(msg)
        logging.info(msg)

    # ---------- low-level ---------- #
    def _get(self, path: str, timeout=20, **params):
        url = f"{self.BASE_URL}{path}"
        msg = f"[FaceitClient] GET {url} params={params} timeout={timeout}"
        print(msg)
        logging.info(msg)
        while True:
            resp = self.session.get(url, params=params, timeout=timeout)
            msg = f"[FaceitClient] Response status: {resp.status_code}"
            print(msg)
            logging.info(msg)
            if resp.status_code == 429:  # rate limited
                msg = "[FaceitClient] Rate limited, sleeping..."
                print(msg)
                logging.warning(msg)
                time.sleep(self._ratelimit_sleep)
                continue
            try:
                resp.raise_for_status()
            except Exception as e:
                msg = f"[FaceitClient] Error: {e} | Response: {resp.text}"
                print(msg)
                logging.error(msg)
                raise
            msg = f"[FaceitClient] Response JSON: {resp.text[:200]}..."
            print(msg)
            logging.info(msg)
            return resp.json()

    # ---------- high-level helpers ---------- #
    @staticmethod
    def lru_cache_with_maxsize(maxsize=1024):
        def decorator(func):
            return lru_cache(maxsize=maxsize)(func)

        return decorator

    @lru_cache(maxsize=1024)
    def get_player(self, nickname: str | None = None, player_id: str | None = None):
        msg = f"[FaceitClient] get_player called with nickname={nickname}, player_id={player_id}"
        print(msg)
        logging.info(msg)
        if not nickname and not player_id:
            raise ValueError("Must provide either nickname or player_id")
        if player_id:
            return self._get(f"/players/{player_id}")
        return self._get("/players", nickname=nickname)

    def player_stats(self, player_id: str, game: str = "cs2"):
        msg = f"[FaceitClient] player_stats called with player_id={player_id}, game={game}"
        print(msg)
        logging.info(msg)
        return self._get(f"/players/{player_id}/stats/{game}")

    def player_matches(self, player_id: str, game: str = "cs2", limit: int = 20, **kw):
        msg = f"[FaceitClient] player_matches called with player_id={player_id}, game={game}, limit={limit}, kw={kw}"
        print(msg)
        logging.info(msg)
        return self._get(f"/players/{player_id}/history", game=game, limit=limit, **kw)

    def match_details(self, match_id: str):
        msg = f"[FaceitClient] match_details called with match_id={match_id}"
        print(msg)
        logging.info(msg)
        return self._get(f"/matches/{match_id}")

    def match_stats(self, match_id: str):
        msg = f"[FaceitClient] match_stats called with match_id={match_id}"
        print(msg)
        logging.info(msg)
        return self._get(f"/matches/{match_id}/stats")
