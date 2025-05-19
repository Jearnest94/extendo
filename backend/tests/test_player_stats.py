import json
import pytest
import responses
from unittest.mock import patch
from backend.app.main import create_app
from backend.app.faceit import FaceitClient, FaceitHTTPError

BASE_URL = FaceitClient.BASE_URL

# Mock FaceitClient to avoid needing an API key for tests
class MockFaceitClient:
    BASE_URL = FaceitClient.BASE_URL
    
    def __init__(self, *args, **kwargs):
        pass  # Skip API key validation
        
    def get_player(self, nickname):
        # Responses library will handle actual mocking based on the URL
        # This is just a pass-through to make the code work
        import requests
        url = f"{self.BASE_URL}/players"
        response = requests.get(url, params={"nickname": nickname})
        return response.json()
    
    def get_player_stats(self, player_id):
        # Responses library will handle actual mocking based on the URL
        import requests
        url = f"{self.BASE_URL}/players/{player_id}/stats/cs2"
        response = requests.get(url)
        return response.json()

@pytest.fixture
def client():
    with patch('backend.app.main.FaceitClient', MockFaceitClient):
        app = create_app()
        app.config['TESTING'] = True
        with app.test_client() as client:
            yield client


@responses.activate
def test_player_stats_get_with_query_param(client):
    """Test the GET method with query params (legacy mode)"""
    # Mock the player lookup endpoint
    responses.add(
        responses.GET,
        f"{BASE_URL}/players",
        json={"player_id": "test_id", "nickname": "test_player"},
        status=200,
        match=[responses.matchers.query_param_matcher({"nickname": "test_player"})]
    )
    
    # Mock the player stats endpoint
    responses.add(
        responses.GET,
        f"{BASE_URL}/players/test_id/stats/cs2",
        json={
            "lifetime": {
                "Average Damage per Round": "85.5",
                "Matches": "100",
                "Win Rate %": "51.5"
            }
        },
        status=200
    )
    
    # Test the endpoint with GET and query param
    response = client.get("/api/player-stats?player=test_player")
    
    assert response.status_code == 200
    data = json.loads(response.data)
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["nickname"] == "test_player"
    assert data[0]["player_id"] == "test_id"
    assert "adr" in data[0]
    assert data[0]["adr"] == "85.5"


@responses.activate
def test_player_stats_post_with_json(client):
    """Test the POST method with JSON body"""
    # Mock the player lookup endpoint for first player
    responses.add(
        responses.GET,
        f"{BASE_URL}/players",
        json={"player_id": "player1_id", "nickname": "player1"},
        status=200,
        match=[responses.matchers.query_param_matcher({"nickname": "player1"})]
    )
    
    # Mock the player stats endpoint for first player
    responses.add(
        responses.GET,
        f"{BASE_URL}/players/player1_id/stats/cs2",
        json={
            "lifetime": {
                "Average Damage per Round": "90.2",
                "Matches": "150",
                "Win Rate %": "55.3"
            }
        },
        status=200
    )
    
    # Mock the player lookup endpoint for second player
    responses.add(
        responses.GET,
        f"{BASE_URL}/players",
        json={"player_id": "player2_id", "nickname": "player2"},
        status=200,
        match=[responses.matchers.query_param_matcher({"nickname": "player2"})]
    )
    
    # Mock the player stats endpoint for second player
    responses.add(
        responses.GET,
        f"{BASE_URL}/players/player2_id/stats/cs2",
        json={
            "lifetime": {
                "ADR": "75.8",  # Using alternative field name
                "Matches": "200",
                "Win Rate %": "48.2"
            }
        },
        status=200
    )
    
    # Test the endpoint with POST and JSON body
    response = client.post(
        "/api/player-stats",
        data=json.dumps({"players": ["player1", "player2"]}),
        content_type="application/json"
    )
    
    assert response.status_code == 200
    data = json.loads(response.data)
    assert isinstance(data, list)
    assert len(data) == 2
    
    # First player
    player1 = next((p for p in data if p["nickname"] == "player1"), None)
    assert player1 is not None
    assert player1["player_id"] == "player1_id"
    assert player1["adr"] == "90.2"
    
    # Second player
    player2 = next((p for p in data if p["nickname"] == "player2"), None)
    assert player2 is not None
    assert player2["player_id"] == "player2_id" 
    assert player2["adr"] == "75.8"


@responses.activate
def test_player_stats_partial_failure(client):
    """Test handling partial failures (one player succeeds, one fails)"""
    # Mock the player lookup endpoint for first player
    responses.add(
        responses.GET,
        f"{BASE_URL}/players",
        json={"player_id": "success_id", "nickname": "success_player"},
        status=200,
        match=[responses.matchers.query_param_matcher({"nickname": "success_player"})]
    )
    
    # Mock the player stats endpoint for successful player
    responses.add(
        responses.GET,
        f"{BASE_URL}/players/success_id/stats/cs2",
        json={
            "lifetime": {
                "Average Damage per Round": "88.7",
                "Matches": "120",
                "Win Rate %": "52.8"
            }
        },
        status=200
    )
    
    # Mock the player lookup endpoint for failed player (404 response)
    responses.add(
        responses.GET,
        f"{BASE_URL}/players",
        json={"errors": [{"message": "Player not found"}]},
        status=404,
        match=[responses.matchers.query_param_matcher({"nickname": "failure_player"})]
    )
    
    # Test the endpoint with both a successful and failing player
    response = client.post(
        "/api/player-stats",
        data=json.dumps({"players": ["success_player", "failure_player"]}),
        content_type="application/json"
    )
    
    # Should return 200 with partial results
    assert response.status_code == 200
    data = json.loads(response.data)
    assert isinstance(data, list)
    
    # Should contain the successful player with stats
    success_player = next((p for p in data if p.get("nickname") == "success_player"), None)
    assert success_player is not None
    assert success_player["player_id"] == "success_id"
    assert success_player["adr"] == "88.7"
    
    # Should contain the failed player with error info
    failure_player = next((p for p in data if p.get("nickname") == "failure_player"), None)
    assert failure_player is not None
    assert "error" in failure_player


@responses.activate
def test_legacy_prematch_info_route(client):
    """Test that the legacy route still works"""
    # Mock the player lookup endpoint
    responses.add(
        responses.GET,
        f"{BASE_URL}/players",
        json={"player_id": "legacy_id", "nickname": "legacy_player"},
        status=200,
        match=[responses.matchers.query_param_matcher({"nickname": "legacy_player"})]
    )
    
    # Mock the player stats endpoint
    responses.add(
        responses.GET,
        f"{BASE_URL}/players/legacy_id/stats/cs2",
        json={
            "lifetime": {
                "Average Damage per Round": "82.3",
                "Matches": "95",
                "Win Rate %": "50.1"
            }
        },
        status=200
    )
    
    # Test the legacy endpoint
    response = client.get("/api/prematch-info?player=legacy_player")
    
    assert response.status_code == 200
    data = json.loads(response.data)
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["nickname"] == "legacy_player"
    assert data[0]["adr"] == "82.3"
