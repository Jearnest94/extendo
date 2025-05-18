# faceit.py

import os
import time
import logging
from functools import lru_cache
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


logging.basicConfig(
    filename=os.getenv("FACEIT_LOGFILE", "faceit_client.log"),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)


# Custom Exceptions
class FaceitHTTPError(RuntimeError):
    def __init__(self, resp: requests.Response):
        super().__init__(f"FACEIT {resp.status_code}: {resp.text[:200]}")

class FaceitRateLimitError(RuntimeError):
    pass


class FaceitClient:
    BASE_URL = "https://open.faceit.com/data/v4"
    # _ratelimit_sleep = 1.1  # simple back-off for free keys - Will be replaced by smarter loop

    def __init__(
        self, api_key: str | None = None, session: requests.Session | None = None
    ):
        self.api_key = api_key or os.getenv("FACEIT_API_KEY")
        msg = f"[FaceitClient] Using API key: {'set' if self.api_key else 'MISSING'}"
        # print(msg) # Removed print
        logging.info(msg)
        if not self.api_key:
            raise ValueError("FACEIT_API_KEY is missing (env var or arg).")
        self.session = session or requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {self.api_key}"})
        
        # Session-level retry adapter
        retry_cfg = Retry(total=3, backoff_factor=0.3, status_forcelist=[502, 503, 504])
        adapter = HTTPAdapter(max_retries=retry_cfg)
        self.session.mount("https://", adapter)
        
        msg = f"[FaceitClient] Session initialized with headers: {self.session.headers} and retry adapter"
        # print(msg) # Removed print
        logging.info(msg)

    # ---------- low-level ---------- #
    def _get(self, path: str, timeout=(5,10), **params) -> dict: # Added type hint and default timeout
        url = f"{self.BASE_URL}{path}"
        logging.info("GET %s params=%s", url, params) # Structured logging

        MAX_RETRIES = 5
        for attempt in range(MAX_RETRIES):
            try:
                resp = self.session.get(url, params=params, timeout=timeout)
                logging.debug(f"[FaceitClient] Response status: {resp.status_code}")

                if resp.status_code == 429:
                    reset = resp.headers.get("X-Rate-Limit-Reset")
                    sleep_for = (int(reset) - int(time.time())) if reset else 1.1 * (attempt + 1) # Added backoff factor for non-header case
                    logging.warning("[FaceitClient] Rate limited (429), sleeping %.1fs", sleep_for)
                    time.sleep(max(1.0, sleep_for))
                    continue
                
                # Retry on 5xx errors handled by HTTPAdapter, but we can add a small delay if needed, though adapter handles backoff
                # if 500 <= resp.status_code < 600:
                #     logging.warning(f"[FaceitClient] Server error {resp.status_code}, attempt {attempt + 1}/{MAX_RETRIES}, retrying after delay...")
                #     time.sleep(0.5 * (attempt + 1)) # Simple incremental backoff
                #     continue

                resp.raise_for_status() # Will raise an HTTPError for 4xx/5xx if not handled by retries
                
                logging.debug(f"[FaceitClient] Response JSON: {resp.text[:200]}...")
                return resp.json()

            except requests.HTTPError as e:
                # If HTTPAdapter retries are exhausted for 5xx, or for other 4xx errors not retried.
                logging.error(f"[FaceitClient] HTTPError: {e} | Response: {getattr(e.response, 'text', 'No response text')[:200]}")
                raise FaceitHTTPError(e.response) from e
            except requests.RequestException as e: # Catch other request exceptions like timeouts not handled by retries
                logging.error(f"[FaceitClient] RequestException: {e}, attempt {attempt + 1}/{MAX_RETRIES}")
                if attempt +1 >= MAX_RETRIES:
                    raise FaceitRateLimitError(f"Exceeded retry budget or other request error: {e}") from e # Or a more generic error
                time.sleep(0.5 * (attempt + 1)) # Simple incremental backoff for other errors
                continue
        
        logging.error("[FaceitClient] Exceeded retry budget for URL: %s", url)
        raise FaceitRateLimitError("Exceeded retry budget")


    # ---------- high-level helpers ---------- #
    @staticmethod
    def lru_cache_with_maxsize(maxsize=1024):
        def decorator(func):
            return lru_cache(maxsize=maxsize)(func)

        return decorator

    @lru_cache(maxsize=1024)
    def get_player(self, nickname: str | None = None, player_id: str | None = None) -> dict:
        """Return the Faceit player details for a nickname or player_id."""
        msg = f"get_player called with nickname={nickname}, player_id={player_id}"
        # print(msg) # Removed print
        logging.info(msg)
        if not nickname and not player_id:
            raise ValueError("Must provide either nickname or player_id")
        if player_id:
            return self._get(f"/players/{player_id}")
        return self._get("/players", nickname=nickname)

    @lru_cache(maxsize=1024) # Added caching
    def get_player_stats(self, player_id: str, game: str = "cs2") -> dict:
        """Return the Faceit stats blob for a player/game combination."""
        msg = f"get_player_stats called with player_id={player_id}, game={game}"
        # print(msg) # Removed print
        logging.info(msg)
        return self._get(f"/players/{player_id}/stats/{game}")

    # backwards-compat for existing code
    player_stats = get_player_stats

    def player_matches(self, player_id: str, game: str = "cs2", limit: int = 20, **kw) -> dict:
        """Return a list of recent matches for a player."""
        msg = f"player_matches called with player_id={player_id}, game={game}, limit={limit}, kw={kw}"
        # print(msg) # Removed print
        logging.info(msg)
        return self._get(f"/players/{player_id}/history", game=game, limit=limit, **kw)

    def match_details(self, match_id: str) -> dict:
        """Return the details for a specific match_id."""
        msg = f"match_details called with match_id={match_id}"
        # print(msg) # Removed print
        logging.info(msg)
        return self._get(f"/matches/{match_id}")

    def match_stats(self, match_id: str) -> dict:
        """Return the statistics for a specific match_id."""
        msg = f"match_stats called with match_id={match_id}"
        # print(msg) # Removed print
        logging.info(msg)
        return self._get(f"/matches/{match_id}/stats")
