# tests/test_faceit.py
import os
import pytest
import responses
import time  # Added for rate limit reset testing
from backend.app.faceit import FaceitClient, FaceitHTTPError, FaceitRateLimitError  # Ensure this import is correct

BASE_URL = FaceitClient.BASE_URL


@pytest.fixture(scope="session")
def client():
    # Use a dummy API key for testing since calls are mocked
    return FaceitClient(api_key="dummy_api_key")


@pytest.fixture
def fc():
    return FaceitClient(api_key="dummy_key")


@pytest.fixture
def no_sleep(monkeypatch):
    monkeypatch.setattr(time, "sleep", lambda x: None)


@responses.activate
def test_can_resolve_player(client):
    # Mock the API call for get_player by nickname
    responses.add(
        responses.GET,
        f"{BASE_URL}/players?nickname=s1mple",  # Correct endpoint for nickname lookup
        json={"player_id": "s1mple_guid", "nickname": "s1mple"},  # Mock response
        status=200,
    )
    data = client.get_player(nickname="s1mple")
    assert data["nickname"].lower() == "s1mple"
    assert data["player_id"] == "s1mple_guid"  # Add an assertion for player_id for completeness


@responses.activate
def test_player_stats_has_segments(client):
    # Mock the API call for get_player by nickname
    responses.add(
        responses.GET,
        f"{BASE_URL}/players?nickname=s1mple",
        json={"player_id": "s1mple_guid", "nickname": "s1mple"},
        status=200,
    )
    # Mock the API call for player_stats
    responses.add(
        responses.GET,
        f"{BASE_URL}/players/s1mple_guid/stats/cs2",  # Default game is cs2
        json={
            "segments": [
                {
                    "type": "cs2",
                    "label": "CS2 Map Statistics",
                    "stats": {"Average K/D Ratio": "1.2"},
                }
            ]
        },  # Mock response with segments
        status=200,
    )

    player = client.get_player(nickname="s1mple")
    stats = client.player_stats(player["player_id"])  # This will use "s1mple_guid"
    assert "segments" in stats
    assert len(stats["segments"]) > 0  # Make the assertion more robust


@responses.activate
def test_get_player_ok(fc):
    responses.add(
        responses.GET,
        f"{BASE_URL}/players/abc",
        json={"player_id": "abc", "nickname": "Demo"},
        status=200,
    )
    assert fc.get_player(player_id="abc")["nickname"] == "Demo"


@responses.activate
def test_get_player_404(fc):
    responses.add(
        responses.GET,
        f"{BASE_URL}/players/notfound",
        json={"error": "Not found"},  # Example error response
        status=404,
    )
    with pytest.raises(FaceitHTTPError):
        fc.get_player(player_id="notfound")


@responses.activate
def test_get_player_stats_ok(fc):
    responses.add(
        responses.GET,
        f"{BASE_URL}/players/abc/stats/cs2",
        json={"lifetime": {"K/D Ratio": "1.5"}},  # Example stats response
        status=200,
    )
    assert fc.get_player_stats(player_id="abc")["lifetime"]["K/D Ratio"] == "1.5"


@responses.activate
@pytest.mark.usefixtures("no_sleep")  # Apply the no_sleep fixture
def test_rate_limit_retry_success_with_header(fc):  # Removed monkeypatch
    # Simulate X-Rate-Limit-Reset header
    reset_time = str(int(time.time()) + 2)  # 2 seconds from now
    responses.add(
        responses.GET,
        f"{BASE_URL}/players/xyz",
        status=429,
        headers={"X-Rate-Limit-Reset": reset_time},
    )
    responses.add(
        responses.GET, f"{BASE_URL}/players/xyz", json={"player_id": "xyz"}, status=200
    )

    player = fc.get_player(player_id="xyz")
    assert player["player_id"] == "xyz"
    assert len(responses.calls) == 2  # Ensure it retried


@responses.activate
@pytest.mark.usefixtures("no_sleep")  # Apply the no_sleep fixture
def test_rate_limit_retry_success_no_header(fc):  # Removed monkeypatch
    # Simulate no X-Rate-Limit-Reset header, should use backoff factor
    responses.add(responses.GET, f"{BASE_URL}/players/abcde", status=429)
    responses.add(
        responses.GET, f"{BASE_URL}/players/abcde", json={"player_id": "abcde"}, status=200
    )

    player = fc.get_player(player_id="abcde")
    assert player["player_id"] == "abcde"
    assert len(responses.calls) == 2  # Ensure it retried


@responses.activate
@pytest.mark.usefixtures("no_sleep")  # Apply the no_sleep fixture
def test_rate_limit_exceeded(fc):  # Removed monkeypatch
    # Simulate multiple 429 responses to exceed MAX_RETRIES (default 5 in _get)
    for i in range(5):
        # Vary reset time slightly to ensure it's not a static value causing issues if logic is flawed
        reset_time = str(int(time.time()) + (i + 1))
        responses.add(
            responses.GET,
            f"{BASE_URL}/players/limitme",
            status=429,
            headers={"X-Rate-Limit-Reset": reset_time},
        )

    with pytest.raises(FaceitRateLimitError):
        fc.get_player(player_id="limitme")
    assert len(responses.calls) == 5


@responses.activate
def test_server_error_retry_from_adapter(fc):
    # The HTTPAdapter should handle these retries based on status_forcelist
    responses.add(responses.GET, f"{BASE_URL}/players/servererror", status=503)  # First call fails
    responses.add(responses.GET, f"{BASE_URL}/players/servererror", status=503)  # Second call fails
    responses.add(
        responses.GET,
        f"{BASE_URL}/players/servererror",
        json={"player_id": "servererror"},
        status=200,
    )  # Third call succeeds

    player = fc.get_player(player_id="servererror")
    assert player["player_id"] == "servererror"
    # The HTTPAdapter retries internally, so from the client's perspective, it might look like 1 call to _get
    # but responses library will see 3 actual HTTP calls.
    assert len(responses.calls) == 3  # Check adapter retried


@responses.activate
def test_get_player_stats_cached(fc):
    responses.add(
        responses.GET,
        f"{BASE_URL}/players/cachedplayer/stats/cs2",
        json={"games": {"cs2": {"faceit_elo": 1200}}},
        status=200,
    )
    # First call - should hit API
    stats1 = fc.get_player_stats(player_id="cachedplayer")
    assert len(responses.calls) == 1
    assert stats1["games"]["cs2"]["faceit_elo"] == 1200

    # Second call - should be cached
    stats2 = fc.get_player_stats(player_id="cachedplayer")
    assert len(responses.calls) == 1  # Still 1 call, meaning it was cached
    assert stats2["games"]["cs2"]["faceit_elo"] == 1200

    # Clear cache for this function and test again
    fc.get_player_stats.cache_clear()
    responses.add(
        responses.GET,
        f"{BASE_URL}/players/cachedplayer/stats/cs2",  # Re-add because cache_clear means next call hits API
        json={"games": {"cs2": {"faceit_elo": 1250}}},
        status=200,
    )
    stats3 = fc.get_player_stats(player_id="cachedplayer")
    assert len(responses.calls) == 2  # Now 2 calls
    assert stats3["games"]["cs2"]["faceit_elo"] == 1250


# Example of how you might test a specific 5xx error if not using the adapter's status_forcelist for it
# or if you wanted to test behavior before adapter kicks in (e.g. specific logging)
@responses.activate
def test_specific_500_error_handling(fc):
    responses.add(responses.GET, f"{BASE_URL}/players/specific500", status=500)
    # Assuming MAX_RETRIES in _get is 1 for this test or adapter doesn't retry 500 by default
    # For this test, we'll assume the HTTPAdapter handles it, so this test might be redundant
    # or needs to be adjusted if _get has its own 5xx retry logic independent of the adapter.
    # Given the current setup, the adapter handles 502,503,504. Other 5xx would raise FaceitHTTPError.
    with pytest.raises(FaceitHTTPError):
        fc.get_player(player_id="specific500")
