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
        
        player_stats_data = fc.get_player_stats(player_id=player_id)

        combined_data = player_details.copy()
        combined_data["stats"] = player_stats_data
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
        player_nicknames = request.args.getlist("player")
        logger.info(f"[player_stats] Called with GET. Headers: {dict(request.headers)}, player_nicknames={player_nicknames}")
    else: # POST
        data = request.get_json(silent=True) or {}
        player_nicknames = data.get("players", [])
        logger.info(f"[player_stats] Called with POST. Headers: {dict(request.headers)}, player_nicknames={player_nicknames}")
    
    if not player_nicknames:
        logger.warning("[player_stats] No player nicknames provided")
        return jsonify({"error": "No player nicknames provided"}), 400
    
    fc = FaceitClient()
    
    all_player_data = []
    with ThreadPoolExecutor(max_workers=len(player_nicknames) or 1) as pool:
        results = list(pool.map(lambda nickname: get_player_data_for_nickname(fc, nickname), player_nicknames))
    
    for data_item in results: # renamed data to data_item to avoid conflict
        if data_item: 
            all_player_data.append(data_item)

    if not all_player_data:
        logger.warning(f"[player_stats] No data fetched for any nicknames: {player_nicknames}")
        return jsonify({"error": "Failed to fetch data for any players"}), 500
    
    for player in all_player_data:
        if player and "stats" in player and isinstance(player["stats"], dict) and "lifetime" in player["stats"]:
            lifetime_stats = player["stats"].get("lifetime", {})
            if isinstance(lifetime_stats, dict):
                player["adr"] = (lifetime_stats.get("Average Damage per Round") or
                               lifetime_stats.get("ADR") or
                               lifetime_stats.get("adr") or "N/A")
            else:
                player["adr"] = "N/A" # Lifetime stats not a dict
        elif player:
             player["adr"] = "N/A" # No valid stats structure

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
    
    if "rounds" in stats_data and stats_data["rounds"]:
        processed_players = set()
        for round_info in stats_data["rounds"]:
            if not isinstance(round_info, dict) or "teams" not in round_info:
                logger.warning(f"[_extract_adr] Skipping round due to unexpected structure: {str(round_info)[:100]}...")
                continue

            for team_key, team_content in round_info.get("teams", {}).items():
                if not isinstance(team_content, dict) or "players" not in team_content:
                    logger.warning(f"[_extract_adr] Skipping team due to unexpected structure: {team_key}, {str(team_content)[:100]}...")
                    continue

                for player in team_content.get("players", []):
                    if not isinstance(player, dict):
                        logger.warning(f"[_extract_adr] Skipping player due to unexpected structure: {str(player)[:100]}...")
                        continue
                        
                    player_id = player.get("player_id")
                    if player_id and player_id not in processed_players:
                        # ADR in match stats is often "Average ADR" or similar in player_stats object
                        adr_value = (player.get("player_stats", {}).get("Average ADR") or
                                     player.get("player_stats", {}).get("ADR"))
                        if adr_value is not None:
                            players_adr.append({
                                "player_id": player_id, 
                                "nickname": player.get("nickname"), 
                                "adr": adr_value
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
    for team_id, team_data in details.get("teams", {}).items():
        enriched_team = team_data.copy()
        enriched_team["team_id"] = team_id
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
        details = fc.match_details(match_id) # Match details (roster, etc.)
        stats = fc.match_stats(match_id)     # Match stats (performance per round/player)

        map_name = "Unknown Map"
        # Try to get map name from stats (often in round_stats of the first round)
        if (stats.get("rounds") and len(stats["rounds"]) > 0 and 
            isinstance(stats["rounds"][0], dict) and 
            stats["rounds"][0].get("round_stats", {}).get("Map")):
            map_name = stats["rounds"][0]["round_stats"]["Map"]
        # Fallback to details if not in stats (less common for map name)
        elif details.get("voting", {}).get("map", {}).get("pick", []):
             map_name = details["voting"]["map"]["pick"][0] if details["voting"]["map"]["pick"] else map_name
        else:
            logger.warning(f"[match_room] Could not determine map name for match_id={match_id}")

        teams_enriched = _enrich_teams(details, map_name)
        players_adr_data = _extract_adr(stats) # ADR from match performance stats

        response_data = {
            "match_id": match_id,
            "map_name": map_name,
            "teams": teams_enriched,
            "player_performance_stats": players_adr_data 
        }
        logger.info(f"[match_room] Successfully processed match_room for match_id={match_id}")
        return jsonify(response_data)
    except Exception as e:
        logger.error(f"[match_room] Error for match_id={match_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 502

def create_app():
    app = Flask(__name__)
    app.debug = os.environ.get("FLASK_ENV") == "development"
    
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

    app.add_url_rule("/api/player-stats", view_func=player_stats, methods=["GET", "POST"])
    app.add_url_rule("/api/prematch-info", view_func=prematch, methods=["GET"])
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
