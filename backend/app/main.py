# Backend: /api/health returns {"status":"ok"}.
# FLASK api


import logging, os
from flask_cors import CORS
from flask import Flask, jsonify, request
from .faceit import FaceitClient
from concurrent.futures import ThreadPoolExecutor

logging.basicConfig(
    filename=os.getenv("BACKEND_LOGFILE", "backend_app.log"),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)


def prematch():
    player_ids = request.args.getlist("player")
    logging.info(f"[prematch] Called with player_ids={player_ids}")
    if not player_ids:
        logging.warning("[prematch] No player IDs provided")
        return jsonify({"error": "No player IDs provided"}), 400
    try:
        fc = FaceitClient()

        def get_stats(pid):
            logging.info(f"[prematch] get_stats for pid={pid}")
            if len(pid) == 36 and "-" in pid:
                player_id = pid
            else:
                player = fc.get_player(nickname=pid)
                player_id = player["player_id"]
            logging.info(f"[prematch] Resolved player_id={player_id}")
            return fc.player_stats(player_id)

        with ThreadPoolExecutor(max_workers=4) as pool:
            data = list(pool.map(get_stats, player_ids))
        logging.info(f"[prematch] Returning data for {len(data)} players")
        return jsonify(data)
    except Exception as e:
        logging.error(f"[prematch] Exception: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 502


def _extract_adr(stats):
    # Example implementation: extract ADR for each player from stats
    players_adr = []
    logging.info("[_extract_adr] Called")
    for team in stats.get("teams", []):
        for player in team.get("players", []):
            adr = player.get("player_stats", {}).get("ADR")
            players_adr.append(
                {
                    "player_id": player.get("player_id"),
                    "nickname": player.get("nickname"),
                    "adr": adr,
                }
            )
    logging.info(f"[_extract_adr] Extracted ADR for {len(players_adr)} players")
    return players_adr


def _enrich_teams(details, map_name):
    # Example implementation: enrich teams with map name
    teams = []
    logging.info(f"[_enrich_teams] Called for map {map_name}")
    for team in details.get("teams", []):
        enriched_team = team.copy()
        enriched_team["map"] = map_name
        teams.append(enriched_team)
    logging.info(f"[_enrich_teams] Enriched {len(teams)} teams")
    return teams


def match_room(match_id):
    logging.info(f"[match_room] Called with match_id={match_id}")
    try:
        fc = FaceitClient()
        details = fc.match_details(match_id)
        stats = fc.match_stats(match_id)
        map_name = stats["rounds"][0]["round_stats"]["Map"]
        teams = _enrich_teams(details, map_name)
        players = _extract_adr(stats)
        logging.info(
            f"[match_room] Returning data for map={map_name}, teams={len(teams)}, players={len(players)}"
        )
        return jsonify({"map": map_name, "teams": teams, "players": players})
    except Exception as e:
        logging.error(f"[match_room] Exception: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 502


# Just a simple health check
def create_app():
    app = Flask(__name__)

    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
    fc = FaceitClient()

    app.add_url_rule("/api/prematch-info", view_func=prematch, methods=["GET"])
    app.add_url_rule(
        "/api/match-room/<match_id>", view_func=match_room, methods=["GET"]
    )

    @app.route("/")
    def index():
        logging.info("[index] / called")
        return jsonify({"message": "Welcome to the API!"})

    @app.route("/api/health", methods=["GET"])
    def health():
        logging.info("[health] /api/health called")
        return jsonify({"status": "ok"})

    return app
