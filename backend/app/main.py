# Backend: /api/health returns {"status":"ok"}.
# FLASK api

import os
import logging
from flask import Flask, jsonify, request
from flask_cors import CORS
from .faceit import FaceitClient, FaceitHTTPError
from concurrent.futures import ThreadPoolExecutor, as_completed
from . import aggregators # For ADR calculation

# Configure logging
# Ensure this doesn't conflict with other logging configurations if they exist elsewhere.
# If faceit.py also configures root logger, consider a more centralized logging setup.
try:
    # Try to create the log directory if it doesn't exist
    log_dir = os.path.dirname(os.getenv("BACKEND_LOGFILE", "./backend_app.log"))
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir, exist_ok=True)
        
    logging.basicConfig(
        filename=os.getenv("BACKEND_LOGFILE", "./backend_app.log"),
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(threadName)s : %(message)s",
    )
except (PermissionError, OSError) as e: # Catch OSError for directory creation issues
    # Fall back to console logging if file logging fails
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(threadName)s : %(message)s",
    )
    logging.warning(f"Could not write to log file or create log directory, falling back to console logging: {e}")

logger = logging.getLogger(__name__)

# Updated helper function to fetch details and stats for a single player nickname, including ADR
def get_player_data_for_nickname(fc: FaceitClient, nickname: str) -> dict:
    try:
        logger.info(f"Fetching player details for nickname: {nickname}")
        player_details = fc.get_player(nickname=nickname)
        if not player_details or "player_id" not in player_details:
            logger.warning(f"Player details not found or missing player_id for nickname {nickname}")
            return {"nickname": nickname, "error": "Player not found", "details": "Could not retrieve player details."}

        player_id = player_details["player_id"]
        logger.info(f"Fetching game stats for player_id: {player_id} (nickname: {nickname})")
        player_game_stats = fc.get_player_stats(player_id=player_id, game="cs2")

        calculated_adr = None
        if player_game_stats and player_game_stats.get("segments"):
            # Try to find an 'Overall' or 'Game' segment for 5v5, otherwise take the first 5v5 segment
            overall_segment = next((s for s in player_game_stats["segments"] if s.get("mode") == "5v5" and ("Overall" in s.get("label", "") or "Game" in s.get("label", ""))), None)
            if not overall_segment:
                overall_segment = next((s for s in player_game_stats["segments"] if s.get("mode") == "5v5"), None)
            
            if overall_segment:
                calculated_adr = aggregators.adr(overall_segment)
                logger.info(f"Calculated ADR for {nickname} ({player_id}): {calculated_adr}")
            else:
                logger.info(f"No suitable segment for ADR calculation found for {nickname} ({player_id})")
        else:
            logger.info(f"No segments found in player_game_stats for ADR calculation for {nickname} ({player_id})")

        return {
            "nickname": player_details.get("nickname"),
            "player_id": player_id,
            "avatar": player_details.get("avatar"),
            "country": player_details.get("country"),
            "games": player_details.get("games"), # Contains Elo, skill level etc.
            "faceit_elo": player_details.get("games", {}).get("cs2", {}).get("faceit_elo"),
            "skill_level": player_details.get("games", {}).get("cs2", {}).get("skill_level"),
            "stats": player_game_stats, # Contains lifetime stats and all segments
            "adr": calculated_adr,
        }
    except FaceitHTTPError as e:
        logger.error(f"Faceit API error for {nickname}: {e}")
        return {"nickname": nickname, "error": "Faceit API Error", "details": str(e)}
    except Exception as e:
        logger.exception(f"Unexpected error processing {nickname}: {e}")
        return {"nickname": nickname, "error": "Internal Server Error", "details": str(e)}

# New helper function to fetch details and stats using player_id, including ADR
def get_player_data_by_id(fc: FaceitClient, player_id: str, nickname: str) -> dict: # Nickname primarily for logging/error context
    try:
        logger.info(f"Fetching player details for player_id: {player_id} (reported nickname: {nickname})")
        player_details = fc.get_player(player_id=player_id)
        if not player_details:
            logger.warning(f"Player details not found for player_id {player_id} (reported nickname: {nickname})")
            return {"nickname": nickname, "player_id": player_id, "error": "Player details not found by ID"}

        # Use nickname from fetched details as the source of truth if available
        authoritative_nickname = player_details.get("nickname", nickname)
        
        logger.info(f"Fetching game stats for player_id: {player_id} (nickname: {authoritative_nickname})")
        player_game_stats = fc.get_player_stats(player_id=player_id, game="cs2")

        calculated_adr = None
        if player_game_stats and player_game_stats.get("segments"):
            overall_segment = next((s for s in player_game_stats["segments"] if s.get("mode") == "5v5" and ("Overall" in s.get("label", "") or "Game" in s.get("label", ""))), None)
            if not overall_segment:
                overall_segment = next((s for s in player_game_stats["segments"] if s.get("mode") == "5v5"), None)

            if overall_segment:
                calculated_adr = aggregators.adr(overall_segment)
                logger.info(f"Calculated ADR for {authoritative_nickname} ({player_id}): {calculated_adr}")
            else:
                logger.info(f"No suitable segment for ADR calculation found for {authoritative_nickname} ({player_id})")
        else:
            logger.info(f"No segments found in player_game_stats for ADR calculation for {authoritative_nickname} ({player_id})")
            
        return {
            "nickname": authoritative_nickname,
            "player_id": player_id,
            "avatar": player_details.get("avatar"),
            "country": player_details.get("country"),
            "games": player_details.get("games"),
            "faceit_elo": player_details.get("games", {}).get("cs2", {}).get("faceit_elo"),
            "skill_level": player_details.get("games", {}).get("cs2", {}).get("skill_level"),
            "stats": player_game_stats,
            "adr": calculated_adr,
        }
    except FaceitHTTPError as e:
        logger.error(f"Faceit API error for player_id {player_id} (nickname: {nickname}): {e}")
        return {"nickname": nickname, "player_id": player_id, "error": "Faceit API Error", "details": str(e)}
    except Exception as e:
        logger.exception(f"Unexpected error processing player_id {player_id} (nickname: {nickname}): {e}")
        return {"nickname": nickname, "player_id": player_id, "error": "Internal Server Error", "details": str(e)}

# Route implementations
def player_stats():
    """
    Endpoint for fetching player statistics by nicknames.
    Accepts GET (legacy, space-separated nicknames) or POST (JSON body with 'players' list).
    """
    logger.info(f"Request to /api/player-stats. Method: {request.method}. Headers: {dict(request.headers)}")
    player_nicknames = []
    if request.method == 'GET':
        nicknames_str = request.args.get("nicknames", "")
        if nicknames_str:
            player_nicknames = [name.strip() for name in nicknames_str.split(" ") if name.strip()]
        logger.info(f"GET request with nicknames: {player_nicknames}")
    elif request.method == 'POST':
        data = request.get_json()
        if data and "players" in data and isinstance(data["players"], list):
            player_nicknames = [str(name).strip() for name in data["players"] if str(name).strip()]
            logger.info(f"POST request with players: {player_nicknames}")
        else:
            logger.warning("POST request to player-stats missing 'players' list or invalid format.")
            return jsonify({"error": "Invalid request body. 'players' list is required."}), 400
    
    if not player_nicknames:
        logger.warning("player-stats called with no player nicknames.")
        return jsonify({"error": "No player nicknames provided"}), 400
    
    fc = FaceitClient()
    all_player_data = []
    
    with ThreadPoolExecutor(max_workers=min(len(player_nicknames), 10)) as pool: # Limit max_workers
        future_to_nickname = {
            pool.submit(get_player_data_for_nickname, fc, name): name for name in player_nicknames
        }
        for future in as_completed(future_to_nickname):
            nickname = future_to_nickname[future]
            try:
                data = future.result()
                if data:
                    all_player_data.append(data)
                else: # Should be handled by helper returning error dict, but as a safeguard
                    all_player_data.append({"nickname": nickname, "error": "Unknown error retrieving data"})
            except Exception as exc:
                logger.exception(f"Future for {nickname} generated an exception: {exc}")
                all_player_data.append({"nickname": nickname, "error": "Processing Error", "details": str(exc)})

    if not all_player_data: # Should not happen if nicknames were provided, errors would be in list
        logger.info("No data processed for any player in player_stats.")
        # This case might indicate all lookups failed before returning structured errors
        return jsonify({"error": "Failed to process any players"}), 500 
    
    logger.info(f"[player_stats] Successfully processed {len(all_player_data)} players (including potential errors).")
    return jsonify(all_player_data)


def prematch():
    """Legacy endpoint, redirects to player_stats (conceptually, actual call)."""
    logger.info(f"[prematch] Legacy endpoint called. Headers: {dict(request.headers)}. Forwarding to player_stats logic.")
    # This doesn't do a formal redirect, but reuses the logic.
    # For a true redirect, you'd use Flask's redirect() but that changes the request type for POST.
    # Given the client expects player_stats's response, directly calling is fine.
    return player_stats()

# New route for match room stats by match_id
def match_room_stats(match_id: str):
    logger.info(f"Request to /api/match-room-stats/{match_id}. Headers: {dict(request.headers)}")
    fc = FaceitClient()
    
    try:
        logger.info(f"Fetching match details for match_id: {match_id}")
        match_details_data = fc.match_details(match_id)
    except FaceitHTTPError as e:
        logger.error(f"Faceit API error fetching match details for {match_id}: {e}")
        return jsonify({"error": "Faceit API Error fetching match details", "details": str(e)}), e.resp.status_code if hasattr(e, 'resp') else 500
    except Exception as e:
        logger.exception(f"Unexpected error fetching match details for {match_id}: {e}")
        return jsonify({"error": "Internal Server Error fetching match details", "details": str(e)}), 500

    if not match_details_data or "teams" not in match_details_data:
        logger.warning(f"Match details for {match_id} are missing or don't contain 'teams' field.")
        return jsonify({"error": "Match not found or invalid match data structure"}), 404

    players_to_fetch = [] # List of (player_id, nickname)
    for team_faction, team_data in match_details_data.get("teams", {}).items():
        for player_info in team_data.get("roster", []):
            if player_info.get("player_id") and player_info.get("nickname"):
                players_to_fetch.append((player_info["player_id"], player_info["nickname"]))
            else:
                logger.warning(f"Skipping player in match {match_id} due to missing ID or nickname: {player_info}")
    
    if not players_to_fetch:
        logger.warning(f"No players found in rosters for match {match_id}.")
        return jsonify({"error": "No players found in the match rosters"}), 404

    logger.info(f"Found {len(players_to_fetch)} players in match {match_id}. Fetching their stats...")
    all_player_data = []
    with ThreadPoolExecutor(max_workers=min(len(players_to_fetch), 10)) as pool: # Limit max_workers
        future_to_player_info = {
            pool.submit(get_player_data_by_id, fc, p_id, p_nick): (p_id, p_nick) 
            for p_id, p_nick in players_to_fetch
        }
        for future in as_completed(future_to_player_info):
            p_id, p_nick = future_to_player_info[future]
            try:
                data = future.result()
                if data:
                    all_player_data.append(data)
                else:
                    all_player_data.append({"nickname": p_nick, "player_id": p_id, "error": "Unknown error retrieving data"})
            except Exception as exc:
                logger.exception(f"Future for player {p_nick} ({p_id}) generated an exception: {exc}")
                all_player_data.append({"nickname": p_nick, "player_id": p_id, "error": "Processing Error", "details": str(exc)})
    
    logger.info(f"[match_room_stats] Successfully processed {len(all_player_data)} players for match {match_id} (including potential errors).")
    return jsonify(all_player_data)


# _extract_adr removed as ADR is now calculated in helper functions.

def _enrich_teams(details: dict, map_name: str) -> list:
    """Enriches team details with the map name. (Potentially for a different feature)"""
    teams = []
    logger.info(f"[_enrich_teams] Enriching teams from details for map: {map_name}")
    for team_id, team_data in details.get("teams", {}).items():
        team_info = {
            "id": team_id,
            "name": team_data.get("name", f"Team {team_id}"),
            "avatar": team_data.get("avatar"),
            "leader_id": team_data.get("leader"),
            "map_name": map_name,
            "players": [p.get("nickname") for p in team_data.get("roster", []) if p.get("nickname")]
        }
        teams.append(team_info)
    if not teams:
        logger.warning("[_enrich_teams] No teams found or enriched.")
    else:
        logger.info(f"[_enrich_teams] Enriched {len(teams)} teams.")
    return teams

def health(): # Added health check for consistency
    logger.info("Health check successful")
    return jsonify({"status": "ok"})

def create_app():
    app = Flask(__name__)
    app.debug = os.environ.get("FLASK_ENV") == "development"
    
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

    # Add routes
    app.add_url_rule("/api/health", view_func=health, methods=["GET"])
    app.add_url_rule("/api/player-stats", view_func=player_stats, methods=["GET", "POST"])
    app.add_url_rule("/api/prematch-info", view_func=prematch, methods=["GET", "POST"]) # Legacy, uses player_stats logic
    app.add_url_rule("/api/match-room-stats/<match_id>", view_func=match_room_stats, methods=["GET"])
    # The old match_room function is not registered as it's superseded by match_room_stats
    # If _enrich_teams is part of another feature, its route would be here.

    logger.info("Flask app created and routes registered.")
    return app

# For running with `python -m app.main` directly (though gunicorn/flask run is preferred)
if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
