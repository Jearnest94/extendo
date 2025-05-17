from flask_cors import CORS
from flask import Flask, jsonify, request
from .faceit import FaceitClient
from concurrent.futures import ThreadPoolExecutor


def prematch():
    player_ids = request.args.getlist("player")
    if not player_ids:
        return jsonify({"error": "No player IDs provided"}), 400
    try:
        fc = FaceitClient()
        with ThreadPoolExecutor(max_workers=4) as pool:
            data = list(pool.map(fc.player_stats, player_ids))
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 502


def _extract_adr(stats):
    players_adr = []
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
    return players_adr


def _enrich_teams(details, map_name):
    teams = []
    for team in details.get("teams", []):
        enriched_team = team.copy()
        enriched_team["map"] = map_name
        teams.append(enriched_team)
    return teams


def match_room(match_id):
    try:
        fc = FaceitClient()
        details = fc.match_details(match_id)
        stats = fc.match_stats(match_id)
        map_name = stats["rounds"][0]["round_stats"]["Map"]
        teams = _enrich_teams(details, map_name)
        players = _extract_adr(stats)
        return jsonify({"map": map_name, "teams": teams, "players": players})
    except Exception as e:
        return jsonify({"error": str(e)}), 502


def create_app():
    app = Flask(__name__)
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
    app.add_url_rule("/api/prematch-info", view_func=prematch, methods=["GET"])
    app.add_url_rule(
        "/api/match-room/<match_id>", view_func=match_room, methods=["GET"]
    )

    @app.route("/")
    def index():
        return jsonify({"message": "Welcome to the API!"})

    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"})

    return app
