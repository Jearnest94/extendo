# Backend: /api/health returns {"status":"ok"}.
# FLASK api

import os
import logging
from flask import Flask, jsonify, request
from flask_cors import CORS
from .faceit import FaceitClient, FaceitHTTPError # Added FaceitHTTPError
from concurrent.futures import ThreadPoolExecutor

# Configure logging
# Ensure this doesn't conflict with other logging configurations if they exist elsewhere.
# If faceit.py also configures root logger, consider a more centralized logging setup.
try:
    logging.basicConfig(
        filename=os.getenv("BACKEND_LOGFILE", "./backend_app.log"), # Changed to current directory
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(threadName)s : %(message)s",
    )
except PermissionError:
    # Fall back to console logging if file logging fails
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(threadName)s : %(message)s",
    )
    logging.warning("Could not write to log file, falling back to console logging")

logger = logging.getLogger(__name__)

# Helper function to fetch details and stats for a single player nickname
def get_player_data_for_nickname(fc: FaceitClient, nickname: str) -> dict | None:
    try:
        logger.info(f"[get_player_data_for_nickname] Fetching data for nickname: {nickname}")
        player_details = fc.get_player(nickname=nickname)
        if not player_details or "player_id" not in player_details:
            logger.warning(f"[get_player_data_for_nickname] Could not resolve nickname to player_id: {nickname}")
            return {"nickname": nickname, "error": "Player not found or no player_id."}

        player_id = player_details["player_id"]
        logger.info(f"[get_player_data_for_nickname] Resolved {nickname} to player_id: {player_id}. Fetching stats.")
        
        # Create a new FaceitClient instance for each thread if session is not thread-safe
        # or ensure the session used by fc is thread-safe.
        # For simplicity here, assuming fc's session is okay or fc is lightweight enough.
        # If fc.session is a shared requests.Session, it's generally thread-safe.
        player_stats = fc.get_player_stats(player_id=player_id)

        # Combine details and stats
        combined_data = player_details.copy() # Start with all player details
        combined_data["stats"] = player_stats  # Add stats under a "stats" key
        logger.info(f"[get_player_data_for_nickname] Successfully fetched data for {nickname}")
        return combined_data
    except FaceitHTTPError as e:
        logger.error(f"[get_player_data_for_nickname] FaceitHTTPError for {nickname}: {e}", exc_info=True)
        return {"nickname": nickname, "error": str(e), "details": "Faceit API error during data retrieval."}
    except Exception as e:
        logger.error(f"[get_player_data_for_nickname] Generic error for {nickname}: {e}", exc_info=True)
        return {"nickname": nickname, "error": str(e), "details": "Generic error during data retrieval."}

# Route implementations (moved from __init__.py and completed)
def player_stats():
    """
    Endpoint for fetching player statistics.
    
    Accepts a JSON body with a list of player nicknames:
    {
        "players": ["nickname1", "nickname2", ...]
    }
    
    Returns a list of player data, maintaining partial results if some players fail.
    """
    if request.method == 'GET':
        # Legacy support for query parameters
        player_nicknames = request.args.getlist("player")
        logger.info(f"[player_stats] Called with GET. Headers: {dict(request.headers)}, player_nicknames={player_nicknames}")
    else:
        # New JSON body approach
        data = request.get_json(silent=True) or {}
        player_nicknames = data.get("players", [])
        logger.info(f"[player_stats] Called with POST, player_nicknames={player_nicknames}")
    
    if not player_nicknames:
        logger.warning("[player_stats] No player nicknames provided")
        return jsonify({"error": "No player nicknames provided"}), 400
    
    fc = FaceitClient() # Initialize client once
    
    all_player_data = []
    # Using ThreadPoolExecutor to fetch player data in parallel with partial-failure semantics
    # Each call to get_player_data_for_nickname will handle one nickname and return error info if it fails
    with ThreadPoolExecutor(max_workers=len(player_nicknames) or 1) as pool:
        # Pass fc instance to the worker function
        results = list(pool.map(lambda nickname: get_player_data_for_nickname(fc, nickname), player_nicknames))
    
    for data in results:
        if data: # Include all results, even error responses
            all_player_data.append(data)

    if not all_player_data:
        logger.warning(f"[player_stats] No data fetched for any nicknames: {player_nicknames}")
        return jsonify({"error": "Failed to fetch data for any players"}), 500
    
    # Extract and include ADR in the player data
    for player in all_player_data:
        if "stats" in player and "lifetime" in player["stats"]:
            lifetime_stats = player["stats"].get("lifetime", {})
            player["adr"] = lifetime_stats.get("Average Damage per Round") or lifetime_stats.get("ADR") or "N/A"
    
    logger.info(f"[player_stats] Successfully processed {len(all_player_data)} players.")
    return jsonify(all_player_data)


# Legacy route name, redirect to player_stats
def prematch():
    """Legacy endpoint, redirects to player_stats"""
    logger.info(f"[prematch] Legacy endpoint called. Headers: {dict(request.headers)}, redirecting to player_stats")
    return player_stats()


def _extract_adr(stats_data: dict) -> list:
    """Extracts Average Damage per Round (ADR) for players from match stats."""
    players_adr = []
    logger.info("[_extract_adr] Extracting ADR from stats_data")
    # Assuming stats_data is the direct JSON response from Faceit Match Stats API
    # which contains a list of rounds, and each round has player stats.
    # This function needs to aggregate ADR across all players over all rounds,
    # or take an average if "ADR" is a per-match summary stat.
    # The original structure `stats.get("teams", [])` seems to be from match_details, not match_stats.
    # Let's assume `stats_data` is the output of `fc.match_stats(match_id)`
    # and ADR is available per player in that payload.

    # If ADR is directly in player objects within "rounds" list:
    # This is a simplified example; actual structure might differ.
    # The Faceit API for match stats typically has a "rounds" array,
    # and each round object has "teams", each with "players".
    # ADR is usually a summary stat, often found in player_stats within a match.
    # For now, sticking to the provided structure in __init__.py, which might be incorrect for ADR.
    # The structure `stats.get("teams", [])` was in the original code,
    # but `fc.match_stats()` returns data with a "rounds" array.
    # Let's assume the `stats` input to this function is the direct output of `fc.match_stats()`
    # and we need to find player stats within that.
    # The example `player.get("player_stats", {}).get("ADR")` suggests ADR is a field.

    # Corrected logic based on typical Faceit match stats structure:
    # Match stats often list players per team per round.
    # We need to find the overall player list and their summary stats.
    # The `match_stats` endpoint usually has a `rounds` array, and inside each round,
    # `round_stats` and then `teams` which contain `players`.
    # Each player object then has `player_stats`.

    # Let's assume `stats_data` is the direct JSON from `fc.match_stats(match_id)`
    # The structure for player stats including ADR might be nested.
    # Example: stats_data -> rounds -> [round_info] -> teams -> [team_info] -> players -> [player_info] -> player_stats -> {"Average ADR": "value"}
    # Or it might be simpler if ADR is a top-level player stat for the match.
    # The original code `for team in stats.get("teams", []):` implies `stats` has a top-level "teams" key.
    # This is more typical of `match_details` rather than `match_stats` for ADR.
    # Given the function name `_extract_adr(stats)`, and that `stats = fc.match_stats(match_id)`
    # I will assume `stats` is the payload from `match_stats`.

    # The `match_stats` endpoint returns a list of rounds. Each round has teams, and players with stats.
    # ADR is typically a summary over the match.
    # Let's look for a summary section if available, or average it if it's per round.
    # For simplicity, if "ADR" is a known field in `player_stats` from the API:
    if "rounds" in stats_data and stats_data["rounds"]: # Ensure rounds exist and is not empty
        # Iterate over all rounds to find player stats, as ADR might be in any round or averaged.
        # This example assumes ADR is found in the first available player_stats object for a player.
        # A more robust solution might average ADR if present in multiple rounds or look for a summary.
        processed_players = set() # To avoid duplicate player entries if they appear in multiple rounds' data similarly
        for round_info in stats_data["rounds"]:
            if not isinstance(round_info, dict) or "teams" not in round_info: # Add guard for round_info structure
                logger.warning(f"[_extract_adr] Skipping round due to unexpected structure: {str(round_info)[:100]}...")
                continue

            for team_key, team_content in round_info.get("teams", {}).items(): # Iterate through team_id and team_data
                if not isinstance(team_content, dict) or "players" not in team_content: # Add guard for team_content structure
                    logger.warning(f"[_extract_adr] Skipping team due to unexpected structure: {team_key}, {str(team_content)[:100]}...")
                    continue

                for player in team_content.get("players", []):
                    if not isinstance(player, dict): # Add guard for player structure
                        logger.warning(f"[_extract_adr] Skipping player due to unexpected structure: {str(player)[:100]}...")
                        continue
                        
                    player_id = player.get("player_id")
                    if player_id and player_id not in processed_players:
                        adr = player.get("player_stats", {}).get("Average ADR") # Common field name for ADR
                        if adr is not None: # Check if ADR is found
                            players_adr.append({
                                "player_id": player_id, 
                                "nickname": player.get("nickname"), 
                                "adr": adr
                            })
                            processed_players.add(player_id)
    if not players_adr:
        logger.warning(f"[_extract_adr] Could not extract ADR from stats_data: {str(stats_data)[:200]}...")
    else:
        logger.info(f"[_extract_adr] Extracted ADR for {len(players_adr)} players: {players_adr}")
    return players_adr


def _enrich_teams(details: dict, map_name: str) -> list:
    """Enriches team details with the map name."""
    teams = []
    logger.info(f"[_enrich_teams] Enriching teams from details for map: {map_name}")
    # `details` is likely from `fc.match_details(match_id)`
    for team_id, team_data in details.get("teams", {}).items(): # Iterate through teams dictionary
        enriched_team = team_data.copy()
        enriched_team["team_id"] = team_id # Add team_id for clarity
        enriched_team["map"] = map_name
        teams.append(enriched_team)
    if not teams:
        logger.warning(f"[_enrich_teams] No teams found in details to enrich: {str(details)[:200]}...")
    else:
        logger.info(f"[_enrich_teams] Enriched {len(teams)} teams.")
    return teams


def match_room(match_id: str):
    logger.info(f"[match_room] Called with match_id={match_id}")
    try:
        fc = FaceitClient()
        details = fc.match_details(match_id)
        stats = fc.match_stats(match_id) # This is the detailed stats per round

        map_name = "Unknown Map"
        if stats.get("rounds") and len(stats["rounds"]) > 0 and stats["rounds"][0].get("round_stats", {}).get("Map"):
            map_name = stats["rounds"][0]["round_stats"]["Map"]
        else:
            logger.warning(f"[match_room] Could not determine map name from stats for match_id={match_id}")

        # Enrich teams from details (which has roster info)
        teams_enriched = _enrich_teams(details, map_name)
        
        # Extract ADR from stats (which has performance data)
        players_adr_data = _extract_adr(stats)

        response_data = {
            "match_id": match_id,
            "map_name": map_name,
            "teams": teams_enriched, # Contains roster and map
            "player_performance_stats": players_adr_data # Contains ADR for players
        }
        logger.info(f"[match_room] Successfully processed match_room for match_id={match_id}")
        return jsonify(response_data)
    except Exception as e:
        logger.error(f"[match_room] Error for match_id={match_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 502


def create_app():
    app = Flask(__name__)
    # Set debug to True if FLASK_ENV is development, otherwise False
    app.debug = os.environ.get("FLASK_ENV") == "development"
    
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

    # Register routes
    app.add_url_rule("/api/player-stats", view_func=player_stats, methods=["GET", "POST"])
    app.add_url_rule("/api/prematch-info", view_func=prematch, methods=["GET"])  # Legacy route
    app.add_url_rule("/api/match-room/<match_id>", view_func=match_room, methods=["GET"])

    @app.route("/")
    def index():
        logger.info("[/] Index route accessed")
        return jsonify({"message": "Welcome to the Extendo API!"})

    @app.route("/api/health", methods=["GET"])
    def health():
        logger.info("[/api/health] Health check accessed")
        return jsonify({"status": "ok"})

    logger.info("Flask app created successfully.")
    return app

# For running with `python -m app.main` directly (though gunicorn/flask run is preferred)
if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get("FLASK_RUN_PORT", 5000))
    host = os.environ.get("FLASK_RUN_HOST", "0.0.0.0")
    logger.info(f"Starting Flask app directly on {host}:{port}")
    app.run(host=host, port=port)
