# faceit.py

import os
import time
import requests
import logging # Changed from basicConfig to logging
from functools import lru_cache
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


logger = logging.getLogger(__name__)


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
        logger.info(msg)
        if not self.api_key:
            # print("[FaceitClient] ERROR: FACEIT_API_KEY not set!") # Removed print
            logger.error("FACEIT_API_KEY not set!") # Changed to logger.error
            raise ValueError("FACEIT_API_KEY is missing (env var or arg).")
        self.session = session or requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {self.api_key}"})
        
        # Session-level retry adapter
        retry_cfg = Retry(total=3, backoff_factor=0.3, status_forcelist=[502, 503, 504])
        adapter = HTTPAdapter(max_retries=retry_cfg)
        self.session.mount("https://", adapter)
        
        msg = f"[FaceitClient] Session initialized with headers: {self.session.headers} and retry adapter"
        # print(msg) # Removed print
        logger.info(msg)

    # ---------- low-level ---------- #
    def _get(self, path: str, timeout=(5,10), **params) -> dict: # Added type hint and default timeout
        url = f"{self.BASE_URL}{path}"
        # logging.info("GET %s params=%s", url, params) # Structured logging - Changed to logger.info
        logger.info(f"GET {url} params={params}")

        MAX_RETRIES = 5
        resp = None # Initialize resp to None
        for attempt in range(MAX_RETRIES):
            try:
                resp = self.session.get(url, params=params, timeout=timeout)
                # logging.debug(f"[FaceitClient] Response status: {resp.status_code}") # Changed to logger.debug
                logger.debug(f"Response status: {resp.status_code}")

                if resp.status_code == 429:
                    reset = resp.headers.get("X-Rate-Limit-Reset")
                    sleep_for = (int(reset) - int(time.time())) if reset else 1.1 * (attempt + 1) # Added backoff factor for non-header case
                    # logging.warning("[FaceitClient] Rate limited (429), sleeping %.1fs", sleep_for) # Changed to logger.warning
                    logger.warning(f"Rate limited (429), sleeping {sleep_for:.1f}s")
                    time.sleep(max(1.0, sleep_for))
                    if attempt == MAX_RETRIES - 1: # If it's the last attempt and still a 429
                        logger.error(f"Rate limit exceeded after {MAX_RETRIES} retries for {url}")
                        raise FaceitRateLimitError(f"Rate limit exceeded for {url} after {MAX_RETRIES} attempts")
                    continue

                # Retry on 5xx errors handled by HTTPAdapter, but we can add a small delay if needed, though adapter handles backoff
                # if 500 <= resp.status_code < 600:
                #     logging.warning(f"[FaceitClient] Server error {resp.status_code}, attempt {attempt + 1}/{MAX_RETRIES}, retrying after delay...")
                #     time.sleep(0.5 * (attempt + 1)) # Simple incremental backoff
                #     continue

                resp.raise_for_status() # Will raise an HTTPError for 4xx/5xx if not handled by retries

                # logging.debug(f"[FaceitClient] Response JSON: {resp.text[:200]}...") # Changed to logger.debug
                logger.debug(f"Response JSON: {resp.text[:200]}...")
                return resp.json()

            except requests.HTTPError as e:
                # If HTTPAdapter retries are exhausted for 5xx, or for other 4xx errors not retried.
                # logging.error(f"[FaceitClient] HTTPError: {e} | Response: {getattr(e.response, 'text', 'No response text')[:200]}") # Changed to logger.error
                logger.error(f"HTTPError: {e} | Response: {getattr(e.response, 'text', 'No response text')[:200]}", exc_info=True)
                # Check if the error is due to a 429 that wasn't caught by the specific FaceitRateLimitError raise
                if e.response is not None and e.response.status_code == 429:
                     logger.warning(f"HTTPError was a 429, raising FaceitRateLimitError for {url}")
                     raise FaceitRateLimitError(f"Rate limit likely hit for {url}, HTTPError with status 429.") from e
                raise FaceitHTTPError(e.response) from e
            except requests.RequestException as e: # Catch other request exceptions (e.g., connection error)
                # logging.error(f"[FaceitClient] RequestException: {e}") # Changed to logger.error
                logger.error(f"RequestException: {e}", exc_info=True)
                # Decide if to wrap this in a custom exception or re-raise
                raise # Re-raise for now, or define a specific FaceitNetworkError
        
        # This part should ideally not be reached if MAX_RETRIES for 429 leads to FaceitRateLimitError,
        # or other errors lead to their respective exceptions.
        # However, as a fallback, if the loop finishes and resp is still indicating an issue (e.g. last attempt was 429 but didn't raise)
        if resp is not None and resp.status_code == 429:
            logger.error(f"Fell through retry loop, final status 429 for {url}. Raising FaceitRateLimitError.")
            raise FaceitRateLimitError(f"Rate limit persisted for {url} after {MAX_RETRIES} attempts.")
        
        # If loop finishes without returning or raising, it's an unexpected state.
        logger.error(f"Exhausted retries for {url} without returning a successful response or raising a specific error. Last status: {resp.status_code if resp else 'No response'}")
        # Ensure resp is not None before trying to access its attributes
        if resp is not None:
            raise FaceitHTTPError(resp) 
        else:
            # This case should be rare, implies network issues not caught by RequestException or other logic error
            raise RuntimeError(f"Failed to get a response for {url} after {MAX_RETRIES} attempts.")


    # ---------- high-level helpers ---------- #
    @staticmethod
    def lru_cache_with_maxsize(maxsize=1024):
        def decorator(func):
            return lru_cache(maxsize=maxsize)(func)

        return decorator

    @lru_cache(maxsize=1024)
    def get_player(self, player_id: str | None = None, nickname: str | None = None) -> dict:
        """Fetches player details by player_id or nickname."""
        if not player_id and not nickname:
            # logging.error("[FaceitClient] get_player called without player_id or nickname") # Changed to logger.error
            logger.error("get_player called without player_id or nickname")
            raise ValueError("Either player_id or nickname must be provided")

        if nickname:
            # logging.info(f"[FaceitClient] get_player called with nickname={nickname}") # Changed to logger.info
            logger.info(f"get_player called with nickname={nickname}")
            return self._get("/players", nickname=nickname)
        # logging.info(f"[FaceitClient] get_player called with player_id={player_id}") # Changed to logger.info
        logger.info(f"get_player called with player_id={player_id}")
        return self._get(f"/players/{player_id}")

    @lru_cache(maxsize=1024)
    def get_player_stats(self, player_id: str, game: str = "cs2") -> dict:
        """Fetches player statistics for a given game."""
        # logging.info(f"[FaceitClient] get_player_stats called with player_id={player_id}, game={game}") # Changed to logger.info
        logger.info(f"get_player_stats called with player_id={player_id}, game={game}")
        return self._get(f"/players/{player_id}/stats/{game}")

    # backwards-compat for existing code
    player_stats = get_player_stats

    def player_matches(self, player_id: str, game: str = "cs2", limit: int = 20, **kw) -> dict:
        """Fetches player match history."""
        # logging.info(f"[FaceitClient] player_matches called for player_id={player_id}, game={game}, limit={limit}") # Changed to logger.info
        logger.info(f"player_matches called for player_id={player_id}, game={game}, limit={limit}")
        return self._get(f"/players/{player_id}/history", game=game, limit=limit, **kw)

    def match_details(self, match_id: str) -> dict:
        """Fetches details for a specific match."""
        # logging.info(f"[FaceitClient] match_details called for match_id={match_id}") # Changed to logger.info
        logger.info(f"match_details called for match_id={match_id}")
        return self._get(f"/matches/{match_id}")

    def match_stats(self, match_id: str) -> dict:
        """Fetches statistics for a specific match."""
        # logging.info(f"[FaceitClient] match_stats called for match_id={match_id}") # Changed to logger.info
        logger.info(f"match_stats called for match_id={match_id}")
        return self._get(f"/matches/{match_id}/stats")
