# tests/test_faceit.py
import os
import pytest
from app.faceit import FaceitClient


@pytest.fixture(scope="session")
def client():
    return FaceitClient(api_key=os.environ["FACEIT_API_KEY"])


def test_can_resolve_player(client):
    data = client.get_player(nickname="s1mple")
    assert data["nickname"].lower() == "s1mple"


def test_player_stats_has_segments(client):
    player = client.get_player(nickname="s1mple")
    stats = client.player_stats(player["player_id"])
    assert "segments" in stats
